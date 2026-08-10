import {
  cancelIdleTask,
  debounce,
  type IdleDeadlineLike,
  scheduleIdleTask,
} from "../../../shared";
import {
  analyzeSeoSortSequence,
  type SeoSortAnalysis,
  type SeoSortReason,
} from "./model/analyzeSeoSortSequence";

type RowEnhancement = {
  row: HTMLElement;
  analysis: SeoSortAnalysis;
};

type SortValueReadResult = {
  hasAttribute: boolean;
  value: number | null;
};

const REASON_LABELS: Record<SeoSortReason, string> = {
  normal: "Последовательность в порядке",
  missing: "Пустое значение",
  duplicate: "Дубликат",
  skipped: "Пропущены позиции",
  "range-change": "Смена диапазона или шага",
  irregular: "Нерегулярный шаг — проверьте значение",
  outlier: "Возможный выброс",
  order: "Нарушен порядок сортировки",
};

class SortHighlight {
  private enabled: boolean = false;
  private observer: MutationObserver | null = null;
  private scheduledProcessId: number | null = null;
  private scheduledBatchId: number | null = null;
  private pendingEnhancements: RowEnhancement[] = [];

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

    const rows = Array.from(doc.querySelectorAll<HTMLElement>(".table-view__item.item"));
    let sortableGroup: Array<{ row: HTMLElement; value: number | null }> = [];
    this.pendingEnhancements = [];

    const flushSortableGroup = () => {
      if (sortableGroup.length === 0) return;

      const analyses = analyzeSeoSortSequence(sortableGroup.map((item) => item.value));
      sortableGroup.forEach((item, index) => {
        this.pendingEnhancements.push({
          row: item.row,
          analysis: analyses[index] ?? { value: null, status: "error", reason: "missing" },
        });
      });
      sortableGroup = [];
    };

    rows.forEach((row) => {
      const sortValue = this.readSortValue(row);
      if (!sortValue.hasAttribute) {
        flushSortableGroup();
        this.cleanupRow(row);
        return;
      }

      sortableGroup.push({ row, value: sortValue.value });
    });
    flushSortableGroup();

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
      this.enhanceRow(item.row, item.analysis);
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

  private readSortValue(row: HTMLElement): SortValueReadResult {
    for (const attributeName of this.SORT_ATTRIBUTE_NAMES) {
      if (!row.hasAttribute(attributeName)) continue;

      const normalizedValue = (row.getAttribute(attributeName) ?? "").trim();
      if (!normalizedValue) return { hasAttribute: true, value: null };

      const sortValue = Number(normalizedValue);
      if (Number.isInteger(sortValue)) {
        return { hasAttribute: true, value: sortValue };
      }

      return { hasAttribute: true, value: null };
    }

    return { hasAttribute: false, value: null };
  }

  private enhanceRow(row: HTMLElement, analysis: SeoSortAnalysis) {
    const doc = this.getDocument();
    if (!doc) return;

    let borderColor = "#34d399";
    let bgColor = "";
    let badgeColor = "#059669";
    let badgeBg = "#d1fae5";
    let badgeBorder = "#6ee7b7";

    if (analysis.status === "error") {
      borderColor = "#f87171";
      bgColor = "rgba(254, 226, 226, 0.3)";
      badgeColor = "#dc2626";
      badgeBg = "#fee2e2";
      badgeBorder = "#fca5a5";
    } else if (analysis.status === "warning") {
      borderColor = "#facc15";
      bgColor = "rgba(254, 243, 199, 0.4)";
      badgeColor = "#b45309";
      badgeBg = "#fef3c7";
      badgeBorder = "#fcd34d";
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
      const displayValue = analysis.value ?? "пусто";
      badge.textContent = `seo_sort:${displayValue}${analysis.status === "normal" ? "" : " ⚠"}`;

      Object.assign(badge.style, {
        fontSize: "9px",
        fontWeight: "600",
        fontFamily: "system-ui, sans-serif",
        fontVariantNumeric: "tabular-nums",
        color: badgeColor,
        backgroundColor: badgeBg,
        padding: "1px 4px",
        borderRadius: "3px",
        border: `1px solid ${badgeBorder}`,
        whiteSpace: "nowrap",
      });

      const stepText = analysis.expectedStep ? ` | обычный шаг: ${analysis.expectedStep}` : "";
      badge.title = `seo_sort: ${displayValue} | ${REASON_LABELS[analysis.reason]}${stepText}`;
    }
  }

  private cleanup() {
    const doc = this.getDocument();
    if (!doc) return;

    doc.querySelectorAll<HTMLElement>(".table-view__item.item").forEach((row) => {
      this.cleanupRow(row);
    });
  }

  private cleanupRow(row: HTMLElement) {
    row.style.boxShadow = "";
    row.style.backgroundColor = "";

    const wrapper = row.querySelector<HTMLElement>(".sort-highlight-wrapper");
    if (!wrapper) return;

    const codeProduct = wrapper.querySelector<HTMLElement>(".codeProduct");
    if (codeProduct) {
      wrapper.insertAdjacentElement("afterend", codeProduct);
    }
    wrapper.remove();
  }
}

export const sortHighlight = new SortHighlight();
