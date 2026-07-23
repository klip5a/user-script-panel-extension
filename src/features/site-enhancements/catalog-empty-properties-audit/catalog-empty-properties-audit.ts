import { debounce, getDocument } from "../../../shared";
import {
  analyzeCatalogTables,
  type CatalogAuditResults,
} from "./model/analyzeCatalogTables";

type AuditMode = "cells" | "rows" | "all";

type PanelRefs = {
  root: HTMLElement;
  body: HTMLElement;
  collapsedButton: HTMLButtonElement;
  collapsedCount: HTMLElement;
  modeButtons: Record<AuditMode, HTMLButtonElement>;
  modeCounts: Record<AuditMode, HTMLElement>;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  position: HTMLElement;
};

const STYLE_ID = "cnc1-catalog-audit-styles";
const PANEL_ID = "cnc1-catalog-audit-panel";
const COLLAPSED_STORAGE_KEY = "catalogEmptyPropertiesAuditCollapsed";
const EMPTY_CELL_CLASS = "cnc1-catalog-audit-empty-cell";
const ROW_WITH_EMPTY_CLASS = "cnc1-catalog-audit-row-with-empty";
const ALL_EMPTY_ROW_CLASS = "cnc1-catalog-audit-all-empty";
const ACTIVE_TARGET_CLASS = "cnc1-catalog-audit-active";

const MODE_LABELS: Record<AuditMode, string> = {
  cells: "Ячейки",
  rows: "Товары",
  all: "Полностью",
};

const EMPTY_RESULTS: CatalogAuditResults = {
  emptyCells: [],
  rowsWithEmpty: [],
  allEmptyRows: [],
  validTables: 0,
};

const STYLES = `
  .${EMPTY_CELL_CLASS} {
    background: #fff3bf !important;
    box-shadow: inset 0 0 0 2px #d69e00 !important;
  }

  tr.${ROW_WITH_EMPTY_CLASS}:not(.${ALL_EMPTY_ROW_CLASS}) > td:first-child {
    box-shadow: inset 4px 0 0 #d69e00 !important;
  }

  tr.${ALL_EMPTY_ROW_CLASS} > td {
    background: #ffe1dc !important;
  }

  tr.${ALL_EMPTY_ROW_CLASS} > td:first-child {
    box-shadow: inset 4px 0 0 #c53a2d !important;
  }

  tr.${ALL_EMPTY_ROW_CLASS} > td.${EMPTY_CELL_CLASS} {
    background: #ffd2ca !important;
    box-shadow: inset 0 0 0 2px #c53a2d !important;
  }

  td.${ACTIVE_TARGET_CLASS} {
    outline: 3px solid #1677a8 !important;
    outline-offset: -3px !important;
  }

  tr.${ACTIVE_TARGET_CLASS} > td {
    box-shadow: inset 0 3px 0 #1677a8, inset 0 -3px 0 #1677a8 !important;
  }

  tr.${ACTIVE_TARGET_CLASS} > td:first-child {
    box-shadow:
      inset 3px 0 0 #1677a8,
      inset 0 3px 0 #1677a8,
      inset 0 -3px 0 #1677a8 !important;
  }

  tr.${ACTIVE_TARGET_CLASS} > td:last-child {
    box-shadow:
      inset -3px 0 0 #1677a8,
      inset 0 3px 0 #1677a8,
      inset 0 -3px 0 #1677a8 !important;
  }

  #${PANEL_ID} {
    position: fixed;
    top: 50%;
    right: 14px;
    z-index: 2147483000;
    width: 208px;
    transform: translateY(-50%);
    color: #25313b;
    font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  #${PANEL_ID}[hidden],
  #${PANEL_ID} [hidden] {
    display: none !important;
  }

  .cnc1-catalog-audit__body {
    overflow: hidden;
    border: 1px solid #aeb8c2;
    border-radius: 8px;
    background: #f8fafb;
    box-shadow: 0 10px 28px rgba(34, 49, 60, 0.2);
  }

  .cnc1-catalog-audit__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 10px;
    border-bottom: 1px solid #d6dde2;
    background: #edf2f5;
  }

  .cnc1-catalog-audit__title {
    font-weight: 700;
  }

  .cnc1-catalog-audit__collapse,
  .cnc1-catalog-audit__nav-button {
    display: inline-grid;
    place-items: center;
    min-width: 30px;
    min-height: 30px;
    padding: 0;
    border: 1px solid #aeb8c2;
    border-radius: 5px;
    background: #fff;
    color: #25313b;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }

  .cnc1-catalog-audit__collapse:hover,
  .cnc1-catalog-audit__nav-button:hover:not(:disabled) {
    border-color: #6f808d;
    background: #eef4f7;
  }

  .cnc1-catalog-audit__collapse:focus-visible,
  .cnc1-catalog-audit__nav-button:focus-visible,
  .cnc1-catalog-audit__mode:focus-visible,
  .cnc1-catalog-audit__collapsed-button:focus-visible {
    outline: 3px solid #2fc6f6;
    outline-offset: 2px;
  }

  .cnc1-catalog-audit__modes {
    display: grid;
    gap: 1px;
    padding: 8px;
    background: #dce3e7;
  }

  .cnc1-catalog-audit__mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 34px;
    padding: 6px 9px;
    border: 0;
    background: #fff;
    color: #344550;
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .cnc1-catalog-audit__mode[aria-pressed="true"] {
    background: #d9eef8;
    color: #0d5273;
    font-weight: 700;
  }

  .cnc1-catalog-audit__mode-count,
  .cnc1-catalog-audit__position,
  .cnc1-catalog-audit__collapsed-count {
    font-variant-numeric: tabular-nums;
    font-weight: 800;
  }

  .cnc1-catalog-audit__nav {
    display: grid;
    grid-template-columns: 30px 1fr 30px;
    align-items: center;
    gap: 7px;
    padding: 9px 10px 10px;
    border-top: 1px solid #d6dde2;
  }

  .cnc1-catalog-audit__nav-button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .cnc1-catalog-audit__position {
    text-align: center;
  }

  .cnc1-catalog-audit__collapsed-button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    padding: 8px 11px;
    border: 1px solid #aeb8c2;
    border-radius: 8px;
    background: #fff3bf;
    color: #5f4700;
    box-shadow: 0 8px 24px rgba(34, 49, 60, 0.2);
    cursor: pointer;
    font: inherit;
  }

  .cnc1-catalog-audit__collapsed-mark {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #c53a2d;
    color: #fff;
    font-weight: 900;
  }

  @media (prefers-reduced-motion: reduce) {
    #${PANEL_ID},
    #${PANEL_ID} * {
      scroll-behavior: auto !important;
      transition: none !important;
      animation: none !important;
    }
  }
`;

export class CatalogEmptyPropertiesAudit {
  private enabled = false;
  private panelVisible = true;
  private collapsed = false;
  private observer: MutationObserver | null = null;
  private results = EMPTY_RESULTS;
  private panel: PanelRefs | null = null;
  private mode: AuditMode = "cells";
  private indices: Record<AuditMode, number> = { cells: -1, rows: -1, all: -1 };
  private activeTarget: HTMLElement | null = null;
  private activeTimeout: number | null = null;
  private readonly scanDebounced = debounce(() => this.scan(), 180);

  start(): void {
    if (this.enabled) return;
    this.enabled = true;

    const doc = getDocument();
    if (!doc?.body) return;

    this.injectStyles(doc);
    this.observer = new MutationObserver((mutations) => {
      const hasExternalMutation = mutations.some((mutation) => {
        const target =
          mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        return !target?.closest(`#${PANEL_ID}`);
      });
      if (hasExternalMutation) this.scanDebounced();
    });
    this.observer.observe(doc.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    void this.loadCollapsedState();
    this.scan();
  }

  setPanelVisible(visible: boolean): void {
    this.panelVisible = visible;
    this.updatePanel();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.observer?.disconnect();
    this.observer = null;
    this.clearDecorations();
    this.clearActiveTarget();
    this.panel?.root.remove();
    this.panel = null;
    getDocument()?.getElementById(STYLE_ID)?.remove();
    this.results = EMPTY_RESULTS;
  }

  private scan(): void {
    if (!this.enabled) return;
    const doc = getDocument();
    if (!doc) return;

    this.clearActiveTarget();
    this.clearDecorations();
    this.results = analyzeCatalogTables(doc);
    this.results.emptyCells.forEach((cell) => cell.classList.add(EMPTY_CELL_CLASS));
    this.results.rowsWithEmpty.forEach((row) => row.classList.add(ROW_WITH_EMPTY_CLASS));
    this.results.allEmptyRows.forEach((row) => row.classList.add(ALL_EMPTY_ROW_CLASS));

    (Object.keys(this.indices) as AuditMode[]).forEach((mode) => {
      const lastIndex = this.getTargets(mode).length - 1;
      this.indices[mode] = Math.min(this.indices[mode], lastIndex);
    });

    this.updatePanel();
  }

  private clearDecorations(): void {
    this.results.emptyCells.forEach((cell) => cell.classList.remove(EMPTY_CELL_CLASS));
    this.results.rowsWithEmpty.forEach((row) => row.classList.remove(ROW_WITH_EMPTY_CLASS));
    this.results.allEmptyRows.forEach((row) => row.classList.remove(ALL_EMPTY_ROW_CLASS));
  }

  private getTargets(mode: AuditMode): HTMLElement[] {
    if (mode === "cells") return this.results.emptyCells;
    if (mode === "rows") return this.results.rowsWithEmpty;
    return this.results.allEmptyRows;
  }

  private updatePanel(): void {
    if (!this.enabled) return;

    if (this.results.validTables === 0) {
      this.panel?.root.remove();
      this.panel = null;
      return;
    }

    const doc = getDocument();
    if (!doc?.body) return;
    const panel = this.panel ?? this.createPanel(doc);
    this.panel = panel;

    panel.root.hidden = !this.panelVisible;
    panel.body.hidden = this.collapsed;
    panel.collapsedButton.hidden = !this.collapsed;

    const counts: Record<AuditMode, number> = {
      cells: this.results.emptyCells.length,
      rows: this.results.rowsWithEmpty.length,
      all: this.results.allEmptyRows.length,
    };

    (Object.keys(counts) as AuditMode[]).forEach((mode) => {
      panel.modeCounts[mode].textContent = String(counts[mode]);
      panel.modeButtons[mode].setAttribute("aria-pressed", String(this.mode === mode));
    });

    const targets = this.getTargets(this.mode);
    const currentIndex = this.indices[this.mode];
    const currentPosition = currentIndex >= 0 && targets.length > 0 ? currentIndex + 1 : 0;
    panel.position.textContent = `${currentPosition} / ${targets.length}`;
    panel.previousButton.disabled = targets.length === 0;
    panel.nextButton.disabled = targets.length === 0;
    panel.collapsedCount.textContent = String(counts.cells);
    panel.collapsedButton.setAttribute(
      "aria-label",
      `Развернуть проверку свойств. Пустых ячеек: ${counts.cells}`,
    );
  }

  private createPanel(doc: Document): PanelRefs {
    const root = doc.createElement("aside");
    root.id = PANEL_ID;
    root.setAttribute("aria-label", "Проверка заполненности свойств");

    const body = doc.createElement("div");
    body.className = "cnc1-catalog-audit__body";

    const header = doc.createElement("div");
    header.className = "cnc1-catalog-audit__header";
    const title = doc.createElement("strong");
    title.className = "cnc1-catalog-audit__title";
    title.textContent = "Пустые свойства";
    const collapseButton = this.createButton(doc, "−", "Свернуть панель");
    collapseButton.className = "cnc1-catalog-audit__collapse";
    collapseButton.addEventListener("click", () => void this.setCollapsed(true));
    header.append(title, collapseButton);

    const modes = doc.createElement("div");
    modes.className = "cnc1-catalog-audit__modes";
    const modeButtons = {} as Record<AuditMode, HTMLButtonElement>;
    const modeCounts = {} as Record<AuditMode, HTMLElement>;

    (Object.keys(MODE_LABELS) as AuditMode[]).forEach((mode) => {
      const button = this.createButton(doc, "", `Показать: ${MODE_LABELS[mode]}`);
      button.className = "cnc1-catalog-audit__mode";
      button.setAttribute("aria-pressed", "false");
      const label = doc.createElement("span");
      label.textContent = MODE_LABELS[mode];
      const count = doc.createElement("strong");
      count.className = "cnc1-catalog-audit__mode-count";
      count.textContent = "0";
      button.append(label, count);
      button.addEventListener("click", () => {
        this.mode = mode;
        this.updatePanel();
      });
      modes.appendChild(button);
      modeButtons[mode] = button;
      modeCounts[mode] = count;
    });

    const nav = doc.createElement("div");
    nav.className = "cnc1-catalog-audit__nav";
    const previousButton = this.createButton(doc, "←", "Предыдущая позиция");
    previousButton.className = "cnc1-catalog-audit__nav-button";
    previousButton.addEventListener("click", () => this.navigate(-1));
    const position = doc.createElement("span");
    position.className = "cnc1-catalog-audit__position";
    position.setAttribute("aria-live", "polite");
    position.textContent = "0 / 0";
    const nextButton = this.createButton(doc, "→", "Следующая позиция");
    nextButton.className = "cnc1-catalog-audit__nav-button";
    nextButton.addEventListener("click", () => this.navigate(1));
    nav.append(previousButton, position, nextButton);

    body.append(header, modes, nav);

    const collapsedButton = this.createButton(doc, "", "Развернуть проверку свойств");
    collapsedButton.className = "cnc1-catalog-audit__collapsed-button";
    const mark = doc.createElement("span");
    mark.className = "cnc1-catalog-audit__collapsed-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = "!";
    const collapsedCount = doc.createElement("strong");
    collapsedCount.className = "cnc1-catalog-audit__collapsed-count";
    collapsedCount.textContent = "0";
    collapsedButton.append(mark, collapsedCount);
    collapsedButton.addEventListener("click", () => void this.setCollapsed(false));

    root.append(body, collapsedButton);
    doc.body.appendChild(root);

    return {
      root,
      body,
      collapsedButton,
      collapsedCount,
      modeButtons,
      modeCounts,
      previousButton,
      nextButton,
      position,
    };
  }

  private createButton(doc: Document, text: string, label: string): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", label);
    return button;
  }

  private navigate(direction: -1 | 1): void {
    const targets = this.getTargets(this.mode);
    if (targets.length === 0) return;

    const currentIndex = this.indices[this.mode];
    const nextIndex =
      currentIndex < 0
        ? direction > 0
          ? 0
          : targets.length - 1
        : (currentIndex + direction + targets.length) % targets.length;
    this.indices[this.mode] = nextIndex;

    const target = targets[nextIndex];
    this.highlightTarget(target);
    const view = target.ownerDocument.defaultView;
    const reduceMotion = view?.matchMedia("(prefers-reduced-motion: reduce)").matches ?? false;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
      inline: "center",
    });
    this.updatePanel();
  }

  private highlightTarget(target: HTMLElement): void {
    this.clearActiveTarget();
    this.activeTarget = target;
    target.classList.add(ACTIVE_TARGET_CLASS);
    this.activeTimeout = window.setTimeout(() => {
      target.classList.remove(ACTIVE_TARGET_CLASS);
      if (this.activeTarget === target) this.activeTarget = null;
      this.activeTimeout = null;
    }, 1800);
  }

  private clearActiveTarget(): void {
    if (this.activeTimeout !== null) {
      window.clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
    this.activeTarget?.classList.remove(ACTIVE_TARGET_CLASS);
    this.activeTarget = null;
  }

  private async loadCollapsedState(): Promise<void> {
    try {
      const stored = await chrome.storage.local.get({ [COLLAPSED_STORAGE_KEY]: false });
      this.collapsed = stored[COLLAPSED_STORAGE_KEY] === true;
      this.updatePanel();
    } catch {
      this.collapsed = false;
    }
  }

  private async setCollapsed(collapsed: boolean): Promise<void> {
    this.collapsed = collapsed;
    this.updatePanel();
    try {
      await chrome.storage.local.set({ [COLLAPSED_STORAGE_KEY]: collapsed });
    } catch {
      // Панель остаётся рабочей, даже если состояние нельзя сохранить.
    }
  }

  private injectStyles(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }
}

export const catalogEmptyPropertiesAudit = new CatalogEmptyPropertiesAudit();
