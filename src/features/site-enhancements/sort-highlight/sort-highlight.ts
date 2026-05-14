import {
  cancelIdleTask,
  debounce,
  type IdleDeadlineLike,
  scheduleIdleTask,
} from "../../../shared";

type RowEnhancement = {
  row: HTMLElement;
  sortValue: number;
  isDuplicate: boolean;
};

class SortHighlight {
  private enabled: boolean = false;
  private observer: MutationObserver | null = null;
  private scheduledProcessId: number | null = null;
  private scheduledBatchId: number | null = null;
  private pendingEnhancements: RowEnhancement[] = [];

  private sortMap: Map<number, HTMLElement[]> = new Map();

  private readonly SORT_THRESHOLD = 5000;
  private readonly ROW_BATCH_SIZE = 30;
  private readonly SORT_ATTRIBUTE_NAMES = ["data-sort", "data-seo-sort", "data-seo_sort"];
  private debouncedProcessAllRows: () => void;

  constructor() {
    this.debouncedProcessAllRows = debounce(this.scheduleProcessAllRows.bind(this), 350);
  }

  private getDocument(): Document | null {
    // Проверяем, есть ли iframe с id="site-iframe"
    const iframe = document.getElementById("site-iframe") as HTMLIFrameElement | null;
    if (iframe) {
      // Dev-режим: работаем с iframe.contentDocument
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document || null;
        if (!doc) {
          console.warn("[SortHighlight] iframe.contentDocument is null");
        }
        return doc;
      } catch (error) {
        // Если нет доступа к iframe (cross-origin), возвращаем null
        console.error("[SortHighlight] Cannot access iframe:", error);
        return null;
      }
    }
    // Production-режим: работаем с родительским document
    return document;
  }

  start() {
    if (this.enabled) return;
    this.enabled = true;

    this.initObservers();

    this.scheduleProcessAllRows();
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;
    this.observer?.disconnect();
    this.cancelScheduledWork();
    this.pendingEnhancements = [];
    this.cleanup();
    this.sortMap.clear();
  }

  private initObservers() {
    const doc = this.getDocument();
    if (!doc) return;

    this.observer = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const m of mutations) if (m.addedNodes.length) shouldProcess = true;
      if (shouldProcess) this.debouncedProcessAllRows();
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
  }

  private processAllRows() {
    if (!this.enabled) return;

    const doc = this.getDocument();
    if (!doc) return;

    const rows = doc.querySelectorAll<HTMLElement>(".table-view__item.item");
    this.sortMap.clear();

    rows.forEach((row) => {
      const sortValue = this.getSortValue(row);
      if (sortValue === null) return;

      if (!this.sortMap.has(sortValue)) {
        this.sortMap.set(sortValue, []);
      }
      this.sortMap.get(sortValue)!.push(row);
    });

    this.pendingEnhancements = [];

    this.sortMap.forEach((elements, sortValue) => {
      const isDuplicate = elements.length > 1;

      elements.forEach((row) => {
        this.pendingEnhancements.push({ row, sortValue, isDuplicate });
      });
    });

    this.scheduleEnhanceBatch();
  }

  private scheduleProcessAllRows() {
    if (!this.enabled || this.scheduledProcessId !== null) return;

    this.scheduledProcessId = scheduleIdleTask(() => {
      this.scheduledProcessId = null;
      this.processAllRows();
    });
  }

  private scheduleEnhanceBatch() {
    if (!this.enabled || this.scheduledBatchId !== null || this.pendingEnhancements.length === 0) {
      return;
    }

    this.scheduledBatchId = scheduleIdleTask((deadline) => {
      this.scheduledBatchId = null;
      this.processEnhanceBatch(deadline);
    });
  }

  private processEnhanceBatch(deadline: IdleDeadlineLike) {
    let processedCount = 0;

    while (
      this.enabled &&
      this.pendingEnhancements.length > 0 &&
      processedCount < this.ROW_BATCH_SIZE &&
      (deadline.didTimeout || deadline.timeRemaining() > 4)
    ) {
      const item = this.pendingEnhancements.shift();
      if (!item) continue;
      this.enhanceRow(item.row, item.sortValue, item.isDuplicate);
      processedCount += 1;
    }

    this.scheduleEnhanceBatch();
  }

  private cancelScheduledWork() {
    if (this.scheduledProcessId !== null) {
      cancelIdleTask(this.scheduledProcessId);
      this.scheduledProcessId = null;
    }

    if (this.scheduledBatchId !== null) {
      cancelIdleTask(this.scheduledBatchId);
      this.scheduledBatchId = null;
    }
  }

  private getSortValue(row: HTMLElement): number | null {
    for (const attributeName of this.SORT_ATTRIBUTE_NAMES) {
      const value = row.getAttribute(attributeName);
      if (value === null) continue;

      const sortValue = Number.parseInt(value, 10);
      if (Number.isFinite(sortValue)) {
        return sortValue;
      }
    }

    return null;
  }

  private enhanceRow(row: HTMLElement, sortValue: number, isDuplicate: boolean) {
    const doc = this.getDocument();
    if (!doc) return;

    const isSuspicious = sortValue > this.SORT_THRESHOLD;

    let borderColor = "#34d399";
    let bgColor = "";
    let badgeColor = "#059669";
    let badgeBg = "#d1fae5";
    let badgeBorder = "#6ee7b7";
    let statusText = "OK";

    if (isSuspicious) {
      borderColor = "#f87171";
      bgColor = "rgba(254, 226, 226, 0.3)";
      badgeColor = "#dc2626";
      badgeBg = "#fee2e2";
      badgeBorder = "#fca5a5";
      statusText = "HIGH SORT";
    } else if (isDuplicate) {
      borderColor = "#facc15";
      bgColor = "rgba(254, 243, 199, 0.4)";
      badgeColor = "#b45309";
      badgeBg = "#fef3c7";
      badgeBorder = "#fcd34d";
      statusText = "DUPLICATE";
    }

    row.style.boxShadow = `inset 4px 0 0 ${borderColor}`;
    row.style.backgroundColor = bgColor;

    const codeProductEl = row.querySelector(".codeProduct") as HTMLElement;

    let wrapper = row.querySelector(".sort-highlight-wrapper") as HTMLElement;
    let badge = row.querySelector(".sort-highlight-badge") as HTMLElement;

    // Создаём flex-контейнер при первом запуске
    if (!wrapper && codeProductEl) {
      wrapper = doc.createElement("span");
      wrapper.className = "sort-highlight-wrapper";
      Object.assign(wrapper.style, {
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
      });
      codeProductEl.insertAdjacentElement("afterend", wrapper);
      wrapper.appendChild(codeProductEl);
    }

    if (!badge && wrapper) {
      badge = doc.createElement("span");
      badge.className = "sort-highlight-badge";
      wrapper.appendChild(badge);
    }

    if (badge) {
      badge.textContent = `seo_sort:${sortValue}${isDuplicate ? " ⚠" : ""}`;

      Object.assign(badge.style, {
        fontSize: "9px",
        fontWeight: "600",
        fontFamily: "system-ui, sans-serif",
        color: badgeColor,
        backgroundColor: badgeBg,
        padding: "1px 4px",
        borderRadius: "3px",
        border: `1px solid ${badgeBorder}`,
        whiteSpace: "nowrap",
      });

      badge.title = `seo_sort: ${sortValue}${isDuplicate ? " (duplicate)" : ""} | ${statusText}`;
    }
  }

  private cleanup() {
    const doc = this.getDocument();
    if (!doc) return;

    doc.querySelectorAll(".table-view__item.item").forEach((row) => {
      const el = row as HTMLElement;
      el.style.boxShadow = "";
      el.style.backgroundColor = "";
    });

    // Восстанавливаем codeProduct из wrapper и удаляем wrapper
    doc.querySelectorAll(".sort-highlight-wrapper").forEach((wrapper) => {
      const codeProduct = wrapper.querySelector(".codeProduct");
      if (codeProduct) {
        wrapper.insertAdjacentElement("afterend", codeProduct);
      }
      wrapper.remove();
    });
  }
}

export const sortHighlight = new SortHighlight();
