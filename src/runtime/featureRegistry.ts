import type { ExtensionSettings } from "../settings/extensionSettings";

export type FeatureRegistryEntry = {
  name: string;
  isEnabled: (settings: ExtensionSettings) => boolean;
  start: (settings: ExtensionSettings) => void;
  stop: () => void;
  /**
   * Узкий адаптер для фич с «инжектирующей» семантикой (selectHelper): вызывается
   * при каждом применении настроек, как это было в рукописной последовательности.
   */
  apply?: (settings: ExtensionSettings) => void;
};

// Единый контракт start/stop с enable-predicate. Ошибка одной фичи логируется
// с её именем и не прерывает применение остальных.
export class FeatureRegistry {
  private readonly entries: FeatureRegistryEntry[];
  private readonly running = new Set<string>();

  constructor(entries: FeatureRegistryEntry[]) {
    this.entries = entries;
  }

  apply(settings: ExtensionSettings): void {
    for (const entry of this.entries) {
      try {
        const shouldRun = entry.isEnabled(settings);
        const isRunning = this.running.has(entry.name);

        // Узкие адаптеры (selectHelper, audit panel) вызываются при каждом применении
        // настроек, пока фича включена — это сохраняет прежнюю семантику.
        if (entry.apply && shouldRun) {
          entry.apply(settings);
          this.running.add(entry.name);
          continue;
        }

        if (shouldRun && !isRunning) {
          entry.start(settings);
          this.running.add(entry.name);
        } else if (!shouldRun && isRunning) {
          entry.stop();
          this.running.delete(entry.name);
        }
      } catch (error) {
        console.error(
          `[FeatureRegistry] Ошибка запуска/остановки фичи "${entry.name}":`,
          error,
        );
      }
    }
  }

  stopAll(): void {
    for (const name of Array.from(this.running)) {
      const entry = this.entries.find((candidate) => candidate.name === name);
      if (!entry) continue;

      try {
        entry.stop();
      } catch (error) {
        console.error(
          `[FeatureRegistry] Ошибка остановки фичи "${name}":`,
          error,
        );
      }
      this.running.delete(name);
    }
  }
}
