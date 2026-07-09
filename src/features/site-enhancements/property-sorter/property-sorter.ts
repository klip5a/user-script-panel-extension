import { debounce, getDocument } from "../../../shared";
import {
  type ParsedValue,
  parseValue,
  compareParsed,
} from "../../../shared/sort-schema";

/**
 * Данные строки таблицы свойств
 */
interface PropertyRowData {
  /** ID свойства (число или n26, n27... для новых) */
  id: string;
  /** Input элемент со значением */
  valueInput: HTMLInputElement;
  /** Input элемент с сортировкой */
  sortInput: HTMLInputElement;
  /** Строка таблицы */
  row: HTMLTableRowElement;
  /** Распарсенное значение для сортировки */
  parsed: ParsedValue;
}

interface SectionRowData {
  nameInput: HTMLInputElement;
  sortInput: HTMLInputElement;
  row: HTMLTableRowElement;
  name: string;
}

const PROPERTY_SORTER_VERSION = "v4";

/**
 * Класс для автосортировки значений свойства типа "список" в Битриксе
 *
 * Добавляет кнопку "Сортировка" рядом с кнопкой "Еще..." на странице
 * редактирования свойства типа "список" в административной панели Битрикса.
 */
class PropertySorter {
  private enabled: boolean = false;
  private observer: MutationObserver | null = null;
  private delegatedClickDoc: Document | null = null;
  private debouncedCheckAndInject: () => void;

  /** ID таблицы свойств */
  private readonly TABLE_ID = "list-tbl";
  /** ID кнопки сортировки */
  private readonly SORT_BTN_ID = "propedit_auto_sort_btn";
  /** ID кнопки сортировки разделов */
  private readonly SECTION_SORT_BTN_ID = "section_auto_sort_btn";
  /** ID кнопки "Еще..." */
  private readonly ADD_BTN_ID = "propedit_add_btn";
  /** Паттерн для извлечения ID из name атрибута */
  private readonly VALUE_FIELD_PATTERN = /^PROPERTY_VALUES\[(\w+)\]\[VALUE\]$/;

  constructor() {
    this.debouncedCheckAndInject = debounce(this.checkAndInject.bind(this), 350);
  }

  /**
   * Запускает функционал
   */
  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.initObserver();
    this.checkAndInject();
  }

  /**
   * Останавливает функционал
   */
  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.observer?.disconnect();
    this.delegatedClickDoc?.removeEventListener("click", this.handleDelegatedClick, true);
    this.delegatedClickDoc = null;
    this.removeSortButton();
    this.removeSectionSortButton();
  }

  /**
   * Инициализирует MutationObserver
   */
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

  /**
   * Проверяет наличие таблицы и инъецирует кнопку
   */
  private checkAndInject(): void {
    const doc = getDocument();
    if (!doc) return;

    const table = doc.getElementById(this.TABLE_ID);
    if (table) {
      this.injectSortButton(doc);
    }

    this.injectSectionSortButton(doc);
  }

  private collectSectionRows(table: HTMLTableElement): SectionRowData[] {
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr.main-grid-row-edit"));
    const result: SectionRowData[] = [];
    const checkedRows = rows.filter((row) => row.classList.contains("main-grid-row-checked"));
    const targetRows = checkedRows.length > 0 ? checkedRows : rows;

    for (const row of targetRows) {
      const nameCell = row.querySelector<HTMLElement>('td[data-column-id="NAME"]');
      const sortCell = row.querySelector<HTMLElement>('td[data-column-id="SORT"]');
      if (!nameCell || !sortCell) continue;

      const nameInput = nameCell.querySelector<HTMLInputElement>('input.main-grid-editor[name="NAME"]');
      const sortInput = sortCell.querySelector<HTMLInputElement>('input.main-grid-editor[name="SORT"]');
      if (!nameInput || !sortInput) continue;

      const name = nameInput.value.trim();
      if (!name) continue;

      result.push({ nameInput, sortInput, row, name });
    }

    return result;
  }

  private reorderSectionRows(tbody: HTMLTableSectionElement, rows: SectionRowData[]): void {
    const rowsToMove = new Set(rows.map((item) => item.row));
    const firstRow = Array.from(tbody.rows).find((row) => rowsToMove.has(row));
    if (!firstRow) return;

    const marker = tbody.ownerDocument.createComment("property-sorter-section-order");
    tbody.insertBefore(marker, firstRow);

    const fragment = tbody.ownerDocument.createDocumentFragment();
    rows.forEach((item) => fragment.appendChild(item.row));
    tbody.insertBefore(fragment, marker);
    marker.remove();
  }

  private applySectionSortValues(rows: SectionRowData[]): void {
    let sortValue = 50;

    rows.forEach((item) => {
      const nextValue = String(sortValue);
      sortValue += 50;

      item.sortInput.value = nextValue;
      item.sortInput.dispatchEvent(new Event("input", { bubbles: true }));
      item.sortInput.dispatchEvent(new Event("change", { bubbles: true }));
      this.highlightInput(item.sortInput);
    });
  }

  private injectSectionSortButton(doc: Document): void {
    const headerCell = Array.from(doc.querySelectorAll<HTMLElement>('th[data-name="SORT"]')).find(
      (cell) => cell.textContent?.includes("Сортировка") ?? false,
    );
    if (!headerCell) return;

    if (headerCell.querySelector(`#${this.SECTION_SORT_BTN_ID}`)) return;

    const button = doc.createElement("button");
    button.type = "button";
    button.id = this.SECTION_SORT_BTN_ID;
    button.textContent = "A-Z";
    button.title = "Отсортировать разделы по названию и проставить SORT шагом 50";
    Object.assign(button.style, {
      padding: "1px 6px",
      fontSize: "11px",
      lineHeight: "14px",
      height: "18px",
      background: "#059669",
      color: "#000",
      fontWeight: "600",
      border: "1px solid #047857",
      cursor: "pointer",
      borderRadius: "4px",
      flex: "0 0 auto",
      whiteSpace: "nowrap",
      alignSelf: "center",
      marginTop: "2px",
    });

    button.addEventListener("mouseenter", () => {
      button.style.background = "#047857";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "#059669";
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.sortSectionGrid(button);
    });

    const titleWrap = headerCell.querySelector<HTMLElement>(".main-grid-cell-head-container");
    if (titleWrap) {
      titleWrap.style.width = "auto";
      titleWrap.style.minWidth = "max-content";
      titleWrap.style.maxWidth = "none";
      titleWrap.style.display = "flex";
      titleWrap.style.flexDirection = "column";
      titleWrap.style.alignItems = "center";
      titleWrap.style.justifyContent = "center";
      headerCell.style.overflow = "visible";
      titleWrap.style.overflow = "visible";
      titleWrap.style.gap = "2px";

      const title = titleWrap.querySelector<HTMLElement>(".main-grid-head-title");
      if (title) {
        title.after(button);
        return;
      }
    }

    headerCell.appendChild(button);
  }

  private removeSectionSortButton(): void {
    const doc = getDocument();
    if (!doc) return;

    doc.getElementById(this.SECTION_SORT_BTN_ID)?.remove();
  }

  private sortSectionGrid(trigger: HTMLElement): void {
    const doc = trigger.ownerDocument;
    const table = trigger.closest<HTMLTableElement>("table.main-grid-table");
    if (!table) {
      this.showNotification(doc, "Таблица разделов не найдена", "error");
      return;
    }

    const tbody = table.tBodies[0];
    if (!tbody) {
      this.showNotification(doc, "Тело таблицы не найдено", "error");
      return;
    }

    const rows = this.collectSectionRows(table);
    if (rows.length < 2) {
      this.showNotification(doc, "Недостаточно строк для сортировки", "warning");
      return;
    }

    rows.sort((a, b) => a.name.localeCompare(b.name, "ru", { sensitivity: "base" }));
    this.reorderSectionRows(tbody, rows);
    this.applySectionSortValues(rows);

    this.showNotification(
      doc,
      `Разделы отсортированы по алфавиту, SORT проставлен шагом 50 (${rows.length})`,
      "success",
    );
  }

  /**
   * Добавляет кнопку сортировки рядом с кнопкой "Еще..."
   */
  private injectSortButton(doc: Document): void {
    const addBtn = doc.getElementById(this.ADD_BTN_ID);
    if (!addBtn) {
      return;
    }

    // Проверяем, не добавлена ли уже кнопка
    if (doc.getElementById(this.SORT_BTN_ID)) return;

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

  /**
   * Удаляет кнопку сортировки
   */
  private removeSortButton(): void {
    const doc = getDocument();
    if (!doc) return;

    const sortBtn = doc.getElementById(this.SORT_BTN_ID);
    sortBtn?.remove();
  }

  /**
   * Выполняет сортировку таблицы
   */
  private performSort(doc: Document): void {
    const table = doc.getElementById(this.TABLE_ID) as HTMLTableElement;
    if (!table) {
      this.showNotification(doc, "Таблица не найдена", "error");
      return;
    }

    const tbody = table.tBodies[0];
    if (!tbody) {
      this.showNotification(doc, "Тело таблицы не найдено", "error");
      return;
    }

    // Собираем данные из строк
    const dataRows = this.collectRowData(table);
    if (dataRows.length === 0) {
      this.showNotification(doc, "Нет данных для сортировки", "warning");
      return;
    }

    dataRows.sort((a, b) => compareParsed(a.parsed, b.parsed));
    this.reorderRows(tbody, dataRows);

    // После сортировки пишем последовательные SORT-значения, чтобы Bitrix не переупорядочивал их сам.
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

    console.info("[PropertySorter]", {
      version: PROPERTY_SORTER_VERSION,
      rows: dataRows.length,
      firstValues,
      has06IR,
    });

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

  /**
   * Собирает данные из строк таблицы
   */
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
        // Иногда Bitrix рендерит SORT вне самой строки. Без него строку лучше пропустить, чем ломать форму.
        continue;
      }

      // Извлекаем ID из name="PROPERTY_VALUES[23528][VALUE]"
      const nameMatch = valueInput.name.match(this.VALUE_FIELD_PATTERN);
      const id = nameMatch ? nameMatch[1] : `unknown_${dataRows.length}`;

      const value = valueInput.value.trim();
      if (!value) continue; // Пропускаем пустые значения

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

  private escapeAttributeValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  /**
   * Подсвечивает input после изменения
   */
  private highlightInput(input: HTMLInputElement): void {
    input.style.backgroundColor = "#d1fae5";
    input.style.transition = "background-color 0.3s";
    setTimeout(() => {
      input.style.backgroundColor = "";
    }, 1500);
  }

  /**
   * Показывает уведомление
   */
  private showNotification(
    doc: Document,
    message: string,
    type: "success" | "error" | "warning",
  ): void {
    const existing = doc.getElementById("property-sorter-notification");
    if (existing) existing.remove();

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
