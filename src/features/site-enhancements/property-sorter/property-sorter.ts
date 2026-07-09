import { debounce, getDocument } from "../../../shared";
import { compareParsed, parseValue, type ParsedValue } from "../../../shared/sort-schema";

interface PropertyRowData {
  id: string;
  valueInput: HTMLInputElement;
  sortInput: HTMLInputElement;
  row: HTMLTableRowElement;
  parsed: ParsedValue;
}

const PROPERTY_SORTER_VERSION = "v4";

class PropertySorter {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private delegatedClickDoc: Document | null = null;
  private readonly debouncedCheckAndInject: () => void;

  private readonly TABLE_ID = "list-tbl";
  private readonly SORT_BTN_ID = "propedit_auto_sort_btn";
  private readonly ADD_BTN_ID = "propedit_add_btn";
  private readonly VALUE_FIELD_PATTERN = /^PROPERTY_VALUES\[(\w+)\]\[VALUE\]$/;

  constructor() {
    this.debouncedCheckAndInject = debounce(this.checkAndInject.bind(this), 350);
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.initObserver();
    this.checkAndInject();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.observer?.disconnect();
    this.delegatedClickDoc?.removeEventListener("click", this.handleDelegatedClick, true);
    this.delegatedClickDoc = null;
    this.removeSortButton();
  }

  private initObserver(): void {
    const doc = getDocument();
    if (!doc) return;

    this.bindDelegatedClick(doc);

    this.observer = new MutationObserver(() => {
      this.debouncedCheckAndInject();
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
  }

  private bindDelegatedClick(doc: Document): void {
    if (this.delegatedClickDoc === doc) return;

    this.delegatedClickDoc?.removeEventListener("click", this.handleDelegatedClick, true);
    doc.addEventListener("click", this.handleDelegatedClick, true);
    this.delegatedClickDoc = doc;
  }

  private readonly handleDelegatedClick = (event: Event): void => {
    const target = event.target as Element | null;
    const sortBtn = target?.closest?.(`#${this.SORT_BTN_ID}`);
    if (!sortBtn) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (sortBtn instanceof HTMLInputElement) {
      sortBtn.value = `Сортировка ${PROPERTY_SORTER_VERSION}: запуск`;
    }

    this.performSort(sortBtn.ownerDocument);
  };

  private checkAndInject(): void {
    const doc = getDocument();
    if (!doc) return;

    const table = doc.getElementById(this.TABLE_ID);
    if (table) {
      this.injectSortButton(doc);
    } else {
      this.removeSortButton();
    }
  }

  private injectSortButton(doc: Document): void {
    const addBtn = doc.getElementById(this.ADD_BTN_ID);
    if (!addBtn || doc.getElementById(this.SORT_BTN_ID)) {
      return;
    }

    const sortBtn = doc.createElement("input");
    sortBtn.type = "button";
    sortBtn.id = this.SORT_BTN_ID;
    sortBtn.className = "adm-btn-big";
    sortBtn.value = `Сортировка ${PROPERTY_SORTER_VERSION}`;
    sortBtn.title = "Автосортировка значений свойства";
    Object.assign(sortBtn.style, {
      marginLeft: "8px",
      background: "#059669",
      color: "#000",
      fontWeight: "600",
      border: "1px solid #047857",
      cursor: "pointer",
    });

    sortBtn.addEventListener("mouseenter", () => {
      sortBtn.style.background = "#047857";
    });
    sortBtn.addEventListener("mouseleave", () => {
      sortBtn.style.background = "#059669";
    });

    addBtn.insertAdjacentElement("afterend", sortBtn);
  }

  private removeSortButton(): void {
    const doc = getDocument();
    if (!doc) return;

    doc.getElementById(this.SORT_BTN_ID)?.remove();
  }

  private performSort(doc: Document): void {
    const table = doc.getElementById(this.TABLE_ID) as HTMLTableElement | null;
    if (!table) {
      this.showNotification(doc, "Таблица не найдена", "error");
      return;
    }

    const tbody = table.tBodies[0];
    if (!tbody) {
      this.showNotification(doc, "Тело таблицы не найдено", "error");
      return;
    }

    const dataRows = this.collectRowData(table);
    if (dataRows.length === 0) {
      this.showNotification(doc, "Нет данных для сортировки", "warning");
      return;
    }

    dataRows.sort((a, b) => compareParsed(a.parsed, b.parsed));
    this.reorderRows(tbody, dataRows);

    let sortIndex = 1;
    dataRows.forEach((item) => {
      const newSort = String(sortIndex++);

      item.sortInput.value = newSort;
      item.sortInput.dispatchEvent(new Event("input", { bubbles: true }));
      item.sortInput.dispatchEvent(new Event("change", { bubbles: true }));
      this.highlightInput(item.sortInput);
    });

    const firstValues = dataRows
      .slice(0, 3)
      .map((item) => item.valueInput.value.trim())
      .join(", ");
    const has06IR = dataRows.some((item) => item.valueInput.value.trim() === "06IR..");

    this.showNotification(
      doc,
      `${PROPERTY_SORTER_VERSION}: отсортировано ${dataRows.length}; первые: ${firstValues || "—"}${has06IR ? "; 06IR найден" : ""}`,
      "success",
    );

    const sortBtn = doc.getElementById(this.SORT_BTN_ID);
    if (sortBtn instanceof HTMLInputElement) {
      sortBtn.value = `Сортировка ${PROPERTY_SORTER_VERSION}`;
    }
  }

  private collectRowData(table: HTMLTableElement): PropertyRowData[] {
    const valueInputs = Array.from(table.querySelectorAll<HTMLInputElement>('input[name$="[VALUE]"]'));
    const dataRows: PropertyRowData[] = [];

    for (const valueInput of valueInputs) {
      const row = valueInput.closest("tr");
      if (!row || row.classList.contains("heading")) {
        continue;
      }

      const sortInput = this.findSortInput(table, row, valueInput);
      if (!sortInput) {
        continue;
      }

      const nameMatch = valueInput.name.match(this.VALUE_FIELD_PATTERN);
      const id = nameMatch ? nameMatch[1] : `unknown_${dataRows.length}`;
      const value = valueInput.value.trim();
      if (!value) continue;

      dataRows.push({
        id,
        valueInput,
        sortInput,
        row,
        parsed: parseValue(value),
      });
    }

    return dataRows;
  }

  private findSortInput(
    table: HTMLTableElement,
    row: HTMLTableRowElement,
    valueInput: HTMLInputElement,
  ): HTMLInputElement | null {
    const rowSortInput = row.querySelector<HTMLInputElement>('input[name$="[SORT]"]');
    if (rowSortInput) {
      return rowSortInput;
    }

    const sortName = valueInput.name.replace(/\[VALUE\]$/, "[SORT]");
    return table.querySelector<HTMLInputElement>(`input[name="${this.escapeAttributeValue(sortName)}"]`);
  }

  private reorderRows(tbody: HTMLTableSectionElement, dataRows: PropertyRowData[]): void {
    const rowsToMove = new Set(dataRows.map((item) => item.row));
    const firstRow = Array.from(tbody.rows).find((row) => rowsToMove.has(row));
    if (!firstRow) return;

    const marker = tbody.ownerDocument.createComment("property-sorter-order");
    tbody.insertBefore(marker, firstRow);

    const fragment = tbody.ownerDocument.createDocumentFragment();
    dataRows.forEach((item) => fragment.appendChild(item.row));
    tbody.insertBefore(fragment, marker);
    marker.remove();
  }

  private escapeAttributeValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private highlightInput(input: HTMLInputElement): void {
    input.style.backgroundColor = "#d1fae5";
    input.style.transition = "background-color 0.3s";
    setTimeout(() => {
      input.style.backgroundColor = "";
    }, 1500);
  }

  private showNotification(doc: Document, message: string, type: "success" | "error" | "warning"): void {
    const existing = doc.getElementById("property-sorter-notification");
    existing?.remove();

    const notification = doc.createElement("div");
    notification.id = "property-sorter-notification";
    notification.textContent = message;

    const colors = {
      success: { bg: "#059669", border: "#047857" },
      error: { bg: "#dc2626", border: "#b91c1c" },
      warning: { bg: "#d97706", border: "#b45309" },
    };

    Object.assign(notification.style, {
      position: "fixed",
      top: "20px",
      right: "20px",
      background: colors[type].bg,
      color: "white",
      padding: "12px 20px",
      borderRadius: "8px",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      zIndex: "999999",
      fontSize: "14px",
      fontWeight: "500",
      fontFamily: "system-ui, sans-serif",
      border: `1px solid ${colors[type].border}`,
    });

    doc.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = "0";
      notification.style.transition = "opacity 0.3s";
      setTimeout(() => notification.remove(), 300);
    }, 2500);
  }
}

export const propertySorter = new PropertySorter();
