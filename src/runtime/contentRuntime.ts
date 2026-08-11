import type { ExtensionSettings } from "../settings/extensionSettings";

type Listener = (...args: unknown[]) => void;

type TrackedListener = {
  target: RuntimeEventListenerTarget;
  type: string;
  listener: Listener;
  options?: boolean | AddEventListenerOptions;
};

export type RuntimeEventListenerTarget = {
  addEventListener(
    type: string,
    listener: Listener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: Listener,
    options?: boolean | AddEventListenerOptions,
  ): void;
};

export type RuntimeWindow = RuntimeEventListenerTarget & {
  setTimeout(handler: () => void, timeout?: number): number;
  clearTimeout(handle: number): void;
  requestIdleCallback?: (
    callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export type RuntimeDocument = RuntimeEventListenerTarget & {
  readyState: string;
};

export type ContentRuntimeDeps = {
  getSettings: () => Promise<ExtensionSettings>;
  subscribe: (callback: (settings: ExtensionSettings) => void) => () => void;
  applyCritical: (settings: ExtensionSettings) => void;
  applyDeferred: (settings: ExtensionSettings) => void;
  window: RuntimeWindow;
  document: RuntimeDocument;
};

const ACTIVITY_EVENTS = ["scroll", "mousemove", "keydown", "touchstart"] as const;
const LOAD_DELAY_MS = 2500;
const IDLE_TIMEOUT_MS = 2000;
const FALLBACK_DELAY_MS = 100;

/**
 * Latest-settings-wins контроллер content runtime.
 *
 * Хранит ровно один актуальный snapshot настроек и обновляет его при каждом
 * storage change до любого применения. Deferred-колбэк читает snapshot в момент
 * выполнения (никогда не воспроизводит захваченный старый объект), а состояния
 * scheduled/applied разделены: устаревшие таймеры и idle-задачи инвалидируются
 * поколением. dispose() снимает storage/DOM/window-слушатели и отменяет pending
 * load-delay, fallback timeout и requestIdleCallback.
 */
export class ContentRuntimeController {
  private readonly deps: ContentRuntimeDeps;
  private snapshot: ExtensionSettings | null = null;
  private deferredApplied = false;
  private deferredGeneration = 0;
  private loadDelayHandle: number | null = null;
  private idleHandle: number | null = null;
  private unsubscribe: (() => void) | null = null;
  private disposed = false;
  private initialized = false;
  private bufferedSettings: ExtensionSettings | null = null;
  private bufferedChange = false;
  private readonly trackedListeners: TrackedListener[] = [];

  constructor(deps: ContentRuntimeDeps) {
    this.deps = deps;
  }

  async start(): Promise<void> {
    // Подписываемся ДО первого чтения: изменения, пришедшие во время асинхронного
    // getSettings, не теряются и могут перезаписать устаревший начальный snapshot.
    this.unsubscribe = this.deps.subscribe((settings) => this.handleSettingsChange(settings));

    const initial = await this.deps.getSettings();
    if (this.disposed) {
      this.bufferedSettings = null;
      return;
    }

    // Актуальным считается последний callback, полученный во время чтения.
    this.initialized = true;
    this.snapshot = this.bufferedSettings ?? initial;
    this.bufferedSettings = null;

    this.deps.applyCritical(this.snapshot);
    if (this.bufferedChange) {
      // Изменение пришло во время чтения — пользователь активен, запускаем
      // deferred немедленно по обычному пути settings-change-as-activity.
      this.bufferedChange = false;
      this.startDeferred();
    } else {
      this.scheduleDeferredStart();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.bufferedSettings = null;
    this.bufferedChange = false;

    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelDeferredScheduled();
    this.removeAllTrackedListeners();
    // Инвалидируем любые уже запланированные deferred-колбэки.
    this.deferredGeneration += 1;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  get isDeferredApplied(): boolean {
    return this.deferredApplied;
  }

  private handleSettingsChange(settings: ExtensionSettings): void {
    if (this.disposed) return;

    if (!this.initialized) {
      // Во время инициализации критичные настройки применяются сразу, а итоговый
      // snapshot выбирается после завершения первого чтения (latest wins).
      this.bufferedChange = true;
      this.bufferedSettings = settings;
      this.deps.applyCritical(settings);
      return;
    }

    // Snapshot обновляется первым: и критические, и deferred применения видят актуальное состояние.
    this.snapshot = settings;
    this.deps.applyCritical(settings);

    if (this.deferredApplied) {
      this.deps.applyDeferred(settings);
    } else {
      // Юзер изменил настройки — значит он активен, запускаем deferred немедленно.
      this.startDeferred();
    }
  }

  private scheduleDeferredStart(): void {
    this.cancelDeferredScheduled();

    if (this.deps.document.readyState === "complete") {
      this.loadDelayHandle = this.deps.window.setTimeout(
        () => this.startDeferred(),
        LOAD_DELAY_MS,
      );
    } else {
      this.addTrackedListener(this.deps.window, "load", () => {
        this.loadDelayHandle = this.deps.window.setTimeout(
          () => this.startDeferred(),
          LOAD_DELAY_MS,
        );
      }, { once: true });
    }

    for (const type of ACTIVITY_EVENTS) {
      this.addTrackedListener(this.deps.window, type, () => this.startDeferred(), {
        once: true,
        passive: true,
      });
    }
  }

  private startDeferred(): void {
    if (this.disposed || this.deferredApplied) return;

    const generation = ++this.deferredGeneration;
    this.cancelDeferredScheduled();
    this.removeDeferredListeners();

    const win = this.deps.window;
    if (typeof win.requestIdleCallback === "function" && typeof win.cancelIdleCallback === "function") {
      const handle = win.requestIdleCallback(
        () => {
          if (this.idleHandle === handle) this.idleHandle = null;
          if (generation !== this.deferredGeneration || this.disposed) return;
          this.applyDeferredNow();
        },
        { timeout: IDLE_TIMEOUT_MS },
      );
      this.idleHandle = handle;
    } else {
      const handle = win.setTimeout(() => {
        if (this.idleHandle === handle) this.idleHandle = null;
        if (generation !== this.deferredGeneration || this.disposed) return;
        this.applyDeferredNow();
      }, FALLBACK_DELAY_MS);
      this.idleHandle = handle;
    }
  }

  private applyDeferredNow(): void {
    if (this.disposed || this.deferredApplied) return;
    this.deferredApplied = true;
    if (this.snapshot) {
      this.deps.applyDeferred(this.snapshot);
    }
  }

  private cancelDeferredScheduled(): void {
    if (this.loadDelayHandle !== null) {
      this.deps.window.clearTimeout(this.loadDelayHandle);
      this.loadDelayHandle = null;
    }

    if (this.idleHandle !== null) {
      const win = this.deps.window;
      if (typeof win.cancelIdleCallback === "function") {
        win.cancelIdleCallback(this.idleHandle);
      } else {
        win.clearTimeout(this.idleHandle);
      }
      this.idleHandle = null;
    }
  }

  private addTrackedListener(
    target: RuntimeEventListenerTarget,
    type: string,
    listener: Listener,
    options?: boolean | AddEventListenerOptions,
  ): void {
    target.addEventListener(type, listener, options);
    this.trackedListeners.push({ target, type, listener, options });
  }

  private removeTrackedListener(tracked: TrackedListener): void {
    tracked.target.removeEventListener(tracked.type, tracked.listener, tracked.options);
  }

  private removeDeferredListeners(): void {
    const deferredTypes = new Set<string>(["load", ...ACTIVITY_EVENTS]);
    const remaining: TrackedListener[] = [];

    for (const tracked of this.trackedListeners) {
      if (deferredTypes.has(tracked.type)) {
        this.removeTrackedListener(tracked);
      } else {
        remaining.push(tracked);
      }
    }
    this.trackedListeners.length = 0;
    this.trackedListeners.push(...remaining);
  }

  private removeAllTrackedListeners(): void {
    for (const tracked of this.trackedListeners) {
      this.removeTrackedListener(tracked);
    }
    this.trackedListeners.length = 0;
  }
}
