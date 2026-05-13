import { getDocument } from "../../../shared";
import {
  parseValue,
  compareParsed,
  type ParsedValue,
} from "../property-sorter/utils/sort-value-parser";

interface PropertyCheckResult {
  propertyId: string;
  propertyName: string;
  isSorted: boolean;
  hasNumericValues: boolean;
  violations: ViolationInfo[];
}

interface ViolationInfo {
  index: number;
  value: string;
}

class FilterSortCheck {
  private enabled: boolean = false;

  // Кэш результатов проверки по property_id
  private checkCache: Map<string, PropertyCheckResult> = new Map();

  start() {
    if (this.enabled) return;
    this.enabled = true;

    this.injectStyles();

    // Ждём полной загрузки DOM через DOMContentLoaded
    this.runWhenReady();
  }

  private runWhenReady() {
    const doc = getDocument();
    if (!doc) return;

    // Если DOM уже загружен
    if (doc.readyState === "complete" || doc.readyState === "interactive") {
      // Небольшая задержка для уверенности что всё отрисовалось
      setTimeout(() => this.scanFilterBoxes(), 100);
    } else {
      // Ждём DOMContentLoaded
      doc.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => this.scanFilterBoxes(), 100);
      });
    }
  }

  stop() {
    if (!this.enabled) return;
    this.enabled = false;

    this.cleanup();
    this.checkCache.clear();
  }

  private scanFilterBoxes() {
    if (!this.enabled) return;

    const doc = getDocument();
    if (!doc) return;

    const filterBoxes = doc.querySelectorAll<HTMLElement>(".bx_filter_parameters_box");

    filterBoxes.forEach((box: HTMLElement) => {
      const propertyId = box.getAttribute("data-property_id");
      if (!propertyId) return;

      // Пропускаем уже проверенные
      if (this.checkCache.has(propertyId)) {
        this.applyCachedResult(box, propertyId);
        return;
      }

      this.checkFilterBox(box);
    });
  }

  private checkFilterBox(box: HTMLElement) {
    const propertyId = box.getAttribute("data-property_id") || "";
    const propertyName = box.getAttribute("data-property_name") || "";

    const valueElements = box.querySelectorAll<HTMLElement>(".filter-value-text[title]");
    if (valueElements.length < 2) return;

    const values: { element: HTMLElement; text: string; parsed: ParsedValue }[] = [];

    valueElements.forEach((el) => {
      const text = el.getAttribute("title") || el.textContent?.trim() || "";
      const parsed = parseValue(text);
      values.push({ element: el, text, parsed });
    });

    // Проверяем числовые значения
    const numericValues = values.filter((v) => v.parsed.type === "number");
    if (numericValues.length < 2) return;

    // Находим нарушения порядка - проверяем возрастание в оригинальном порядке
    const violations: ViolationInfo[] = [];

    for (let i = 1; i < numericValues.length; i++) {
      const prev = numericValues[i - 1];
      const curr = numericValues[i];
      // Если текущее значение меньше предыдущего - это нарушение
      if (compareParsed(prev.parsed, curr.parsed) > 0) {
        violations.push({
          index: i,
          value: curr.text,
        });
      }
    }

    const result: PropertyCheckResult = {
      propertyId,
      propertyName,
      isSorted: violations.length === 0,
      hasNumericValues: true,
      violations,
    };

    this.checkCache.set(propertyId, result);
    this.applyHighlight(box, result, numericValues);
  }

  private applyCachedResult(box: HTMLElement, propertyId: string) {
    const result = this.checkCache.get(propertyId);
    if (!result || !result.hasNumericValues || result.isSorted) return;

    const valueElements = box.querySelectorAll<HTMLElement>(".filter-value-text[title]");
    const numericValues: { element: HTMLElement }[] = [];

    valueElements.forEach((el) => {
      const text = el.getAttribute("title") || el.textContent?.trim() || "";
      const parsed = parseValue(text);
      if (parsed.type === "number") {
        numericValues.push({ element: el });
      }
    });

    this.applyHighlight(box, result, numericValues);
  }

  private applyHighlight(
    box: HTMLElement,
    result: PropertyCheckResult,
    numericValues: { element: HTMLElement }[],
  ) {
    if (result.isSorted) {
      box.classList.remove("filter-sort-warning");
      this.removeBadge(box);
      return;
    }

    box.classList.add("filter-sort-warning");

    // Подсвечиваем только первые 3 нарушения
    const violationsToShow = result.violations.slice(0, 3);
    violationsToShow.forEach((v) => {
      if (numericValues[v.index]) {
        const wrap = numericValues[v.index].element.closest(".filter-value-wrap") as HTMLElement;
        if (wrap) {
          wrap.classList.add("filter-sort-out-of-order");
        }
      }
    });

    this.addBadge(box, result);
  }

  private addBadge(box: HTMLElement, result: PropertyCheckResult) {
    this.removeBadge(box);

    const titleEl = box.querySelector(".bx_filter_parameters_box_title");
    if (!titleEl) return;

    const doc = getDocument();
    if (!doc) return;

    const badge = doc.createElement("span");
    badge.className = "filter-sort-warning-badge";
    badge.textContent = `⚠ ${result.violations.length}`;
    badge.title = `Свойство "${result.propertyName}" имеет нарушения сортировки`;

    titleEl.appendChild(badge);
  }

  private removeBadge(box: HTMLElement) {
    box.querySelector(".filter-sort-warning-badge")?.remove();
  }

  private injectStyles() {
    const doc = getDocument();
    if (!doc || doc.getElementById("filter-sort-check-styles")) return;

    const style = doc.createElement("style");
    style.id = "filter-sort-check-styles";
    style.textContent = `
      .bx_filter_parameters_box.filter-sort-warning .bx_filter_parameters_box_title {
        border-left: 3px solid #f59e0b !important;
        background: rgba(245, 158, 11, 0.1) !important;
        padding-left: 8px !important;
      }
      .filter-value-wrap.filter-sort-out-of-order {
        background: rgba(239, 68, 68, 0.15) !important;
        border-radius: 4px !important;
        border-left: 2px solid #ef4444 !important;
      }
      .filter-sort-warning-badge {
        display: inline-flex;
        align-items: center;
        background: #f59e0b !important;
        color: white !important;
        font-size: 10px !important;
        font-weight: 600 !important;
        padding: 2px 6px !important;
        border-radius: 4px !important;
        margin-left: 8px !important;
        font-family: system-ui, sans-serif !important;
      }
    `;

    doc.head.appendChild(style);
  }

  private cleanup() {
    const doc = getDocument();
    if (!doc) return;

    doc.getElementById("filter-sort-check-styles")?.remove();

    doc.querySelectorAll<HTMLElement>(".filter-sort-warning").forEach((el: HTMLElement) => {
      el.classList.remove("filter-sort-warning");
    });

    doc.querySelectorAll<HTMLElement>(".filter-sort-out-of-order").forEach((el: HTMLElement) => {
      el.classList.remove("filter-sort-out-of-order");
    });

    doc.querySelectorAll<HTMLElement>(".filter-sort-warning-badge").forEach((el: HTMLElement) => {
      el.remove();
    });
  }
}

export const filterSortCheck = new FilterSortCheck();
