import { debounce, getDocument } from "../../../../shared";

interface SectionRowData {
  nameInput: HTMLInputElement;
  sortInput: HTMLInputElement;
  row: HTMLTableRowElement;
  name: string;
}

class SectionSorter {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private readonly debouncedCheckAndInject: () => void;
  private readonly SECTION_SORT_BTN_ID = "section_auto_sort_btn";

  constructor() {
    this.debouncedCheckAndInject = debounce(this.checkAndInject.bind(this), 350);
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;

    const doc = getDocument();
    if (!doc) return;

    this.observer = new MutationObserver(() => {
      this.debouncedCheckAndInject();
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
    this.checkAndInject();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.observer?.disconnect();
    this.removeSectionSortButton();
  }

  private checkAndInject(): void {
    const doc = getDocument();
    if (!doc) return;

    if (this.findSectionSortHeader(doc)) {
      this.injectSectionSortButton(doc);
    } else {
      this.removeSectionSortButton();
    }
  }

  private findSectionSortHeader(doc: Document): HTMLElement | null {
    const candidates = Array.from(doc.querySelectorAll<HTMLElement>('th[data-name="SORT"]'));

    for (const cell of candidates) {
      if (!(cell.textContent?.includes("Сортировка") ?? false)) {
        continue;
      }

      const row = cell.closest("tr");
      if (!row) continue;

      const hasProductCodeColumn =
        !!row.querySelector('th[data-name="PROPERTY_12343"]') ||
        Array.from(row.querySelectorAll<HTMLElement>(".main-grid-head-title")).some((title) =>
          title.textContent?.includes("Код товара"),
        );

      if (!hasProductCodeColumn) {
        return cell;
      }
    }

    return null;
  }

  private injectSectionSortButton(doc: Document): void {
    const headerCell = this.findSectionSortHeader(doc);
    if (!headerCell || headerCell.querySelector(`#${this.SECTION_SORT_BTN_ID}`)) return;

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
      titleWrap.style.overflow = "visible";
      titleWrap.style.gap = "2px";
      headerCell.style.overflow = "visible";

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

  private collectSectionRows(table: HTMLTableElement): SectionRowData[] {
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr.main-grid-row-edit"));
    const checkedRows = rows.filter((row) => row.classList.contains("main-grid-row-checked"));
    const targetRows = checkedRows.length > 0 ? checkedRows : rows;
    const result: SectionRowData[] = [];

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

    const marker = tbody.ownerDocument.createComment("section-sorter-order");
    tbody.insertBefore(marker, firstRow);

    const fragment = tbody.ownerDocument.createDocumentFragment();
    rows.forEach((item) => fragment.appendChild(item.row));
    tbody.insertBefore(fragment, marker);
    marker.remove();
  }

  private applySectionSortValues(rows: SectionRowData[]): void {
    let sortValue = 50;

    rows.forEach((item) => {
      item.sortInput.value = String(sortValue);
      sortValue += 50;
      item.sortInput.dispatchEvent(new Event("input", { bubbles: true }));
      item.sortInput.dispatchEvent(new Event("change", { bubbles: true }));
      this.highlightInput(item.sortInput);
    });
  }

  private highlightInput(input: HTMLInputElement): void {
    input.style.backgroundColor = "#d1fae5";
    input.style.transition = "background-color 0.3s";
    setTimeout(() => {
      input.style.backgroundColor = "";
    }, 1500);
  }

  private showNotification(doc: Document, message: string, type: "success" | "error" | "warning"): void {
    const existing = doc.getElementById("section-sorter-notification");
    existing?.remove();

    const notification = doc.createElement("div");
    notification.id = "section-sorter-notification";
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

export const sectionSorter = new SectionSorter();
