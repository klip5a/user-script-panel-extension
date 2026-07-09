import { render } from "preact";
import { debounce, getDocument } from "../../../../shared";
import { ProductMassEditorApp } from "../ui/ProductMassEditorApp";
import type {
  ProductFieldDescriptor,
  ProductMassEditorDraft,
  ProductFieldOption,
  ProductGridContext,
  ProductMassEditorFieldState,
} from "./types";

class ProductMassEditor {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private readonly debouncedCheckAndInject: () => void;
  private linkedOptionsCache = new Map<string, ProductFieldOption[]>();
  private uiHost: HTMLDivElement | null = null;
  private activeContext: ProductGridContext | null = null;
  private isOpen = false;
  private codes = "";
  private drafts = new Map<string, { key: string; fieldId: string; active: boolean }>();
  private fieldModes = new Map<string, string>();
  private fieldTextValues = new Map<string, string>();
  private fieldSelectedValues = new Map<string, Set<string>>();
  private fieldLinkedQueries = new Map<string, string>();
  private fieldLinkedSelectedValues = new Map<string, string>();
  private fieldLinkedLoading = new Set<string>();

  private readonly PRODUCT_MASS_EDIT_BTN_ID = "product_mass_edit_btn";
  private readonly PRODUCT_MASS_EDIT_BTN_HOST_ID = "product_mass_edit_btn_host";

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
    this.removeProductMassEditButton();
    this.unmountUi();
  }

  private checkAndInject(): void {
    const doc = getDocument();
    if (!doc) return;

    if (this.findProductGridContext(doc)) {
      this.injectProductMassEditButton(doc);
    } else {
      this.removeProductMassEditButton();
      this.close();
    }
  }

  private findProductGridContext(doc: Document): ProductGridContext | null {
    const grids = Array.from(doc.querySelectorAll<HTMLElement>(".main-grid"));

    for (const grid of grids) {
      const table = grid.querySelector<HTMLTableElement>("table.main-grid-table");
      if (!table) continue;

      const hasProductCodeColumn =
        !!table.querySelector('th[data-name="PROPERTY_12343"]') ||
        !!table.querySelector('td[data-column-id="PROPERTY_12343"]');
      if (!hasProductCodeColumn) continue;

      const editableRows = this.getProductEditableRows(table);
      if (editableRows.length === 0) continue;

      const bottomPanels = grid.querySelector<HTMLElement>(".main-grid-bottom-panels");
      const actionPanel =
        bottomPanels?.querySelector<HTMLElement>(".main-grid-panel-wrap") ??
        grid.querySelector<HTMLElement>(".main-grid-action-panel");
      const controlPanelCell =
        bottomPanels?.querySelector<HTMLElement>(".main-grid-control-panel-cell") ??
        actionPanel?.querySelector<HTMLElement>(".main-grid-control-panel-cell") ??
        null;

      return { grid, table, actionPanel, controlPanelCell };
    }

    return null;
  }

  private injectProductMassEditButton(doc: Document): void {
    const context = this.findProductGridContext(doc);
    if ((!context?.controlPanelCell && !context?.actionPanel) || doc.getElementById(this.PRODUCT_MASS_EDIT_BTN_ID)) return;

    const host = doc.createElement("span");
    host.id = this.PRODUCT_MASS_EDIT_BTN_HOST_ID;
    host.className = "main-grid-panel-control-container";
    Object.assign(host.style, {
      marginLeft: "8px",
      verticalAlign: "middle",
    });

    const button = doc.createElement("button");
    button.type = "button";
    button.id = this.PRODUCT_MASS_EDIT_BTN_ID;
    button.className = "ui-btn ui-btn-primary";
    button.textContent = "Массовое редактирование";
    button.title = "Открыть окно массового редактирования товаров";
    button.style.whiteSpace = "nowrap";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open(context);
    });

    host.appendChild(button);

    if (context.controlPanelCell) {
      const cancelContainer = context.controlPanelCell.querySelector<HTMLElement>("#grid_cancel_button");
      if (cancelContainer?.parentNode) {
        cancelContainer.insertAdjacentElement("afterend", host);
      } else {
        context.controlPanelCell.appendChild(host);
      }
      return;
    }

    context.actionPanel?.appendChild(host);
  }

  private removeProductMassEditButton(): void {
    const doc = getDocument();
    if (!doc) return;

    doc.getElementById(this.PRODUCT_MASS_EDIT_BTN_ID)?.remove();
    doc.getElementById(this.PRODUCT_MASS_EDIT_BTN_HOST_ID)?.remove();
  }

  private ensureUiHost(doc: Document): HTMLDivElement {
    if (this.uiHost && this.uiHost.isConnected) {
      return this.uiHost;
    }

    const host = doc.createElement("div");
    host.id = "product-mass-editor-root";
    doc.body.appendChild(host);
    this.uiHost = host;
    return host;
  }

  private unmountUi(): void {
    if (!this.uiHost) return;
    render(null, this.uiHost);
    this.uiHost.remove();
    this.uiHost = null;
    this.isOpen = false;
    this.activeContext = null;
  }

  private open(context: ProductGridContext): void {
    this.activeContext = context;
    this.isOpen = true;

    const fields = this.collectProductActionFields(context.table);
    if (fields.length === 0) return;
    this.syncDrafts(fields);

    this.ensureLinkedOptionsIfNeeded();
    this.renderUi();
  }

  private close(): void {
    this.unmountUi();
  }

  private renderUi(): void {
    const doc = getDocument();
    if (!doc) return;

    const host = this.ensureUiHost(doc);
    const context = this.activeContext ?? this.findProductGridContext(doc);
    const fields = context ? this.collectProductActionFields(context.table) : [];
    const drafts = fields.length > 0 ? this.getDraftStates(fields) : [];

    render(
      <ProductMassEditorApp
        open={this.isOpen}
        codes={this.codes}
        fields={fields}
        drafts={drafts}
        onClose={() => this.close()}
        onApply={() => {
          if (context) this.applyProductMassEdit(context);
        }}
        onCodesChange={(value) => {
          this.codes = value;
          this.renderUi();
        }}
        onDraftActiveChange={(draftKey, active) => {
          const draft = this.drafts.get(draftKey);
          if (!draft) return;
          this.drafts.set(draftKey, { ...draft, active });
          if (active) this.ensureLinkedOptionsIfNeeded();
          this.renderUi();
        }}
        onFieldModeChange={(draftKey, mode) => {
          this.fieldModes.set(draftKey, mode);
          this.renderUi();
        }}
        onFieldTextChange={(draftKey, value) => {
          this.fieldTextValues.set(draftKey, value);
          this.renderUi();
        }}
        onFieldToggleValue={(draftKey, value) => {
          const nextValues = new Set(this.getSelectedValues(draftKey));
          if (nextValues.has(value)) nextValues.delete(value);
          else nextValues.add(value);
          this.fieldSelectedValues.set(draftKey, nextValues);
          this.renderUi();
        }}
        onFieldLinkedQueryChange={(draftKey, value) => {
          this.fieldLinkedQueries.set(draftKey, value);
          this.renderUi();
        }}
        onFieldLinkedSelectedValueChange={(draftKey, value) => {
          this.fieldLinkedSelectedValues.set(draftKey, value);
          this.renderUi();
        }}
      />,
      host,
    );
  }

  private getDraftStates(fields: ProductFieldDescriptor[]): ProductMassEditorDraft[] {
    this.syncDrafts(fields);

    return fields.map((field) => {
      const draft = this.drafts.get(field.id) ?? { key: field.id, fieldId: field.id, active: false };
      return {
        key: draft.key,
        fieldId: field.id,
        active: draft.active,
        fieldState: this.getFieldState(draft.key, field),
      };
    });
  }

  private syncDrafts(fields: ProductFieldDescriptor[]): void {
    const next = new Map<string, { key: string; fieldId: string; active: boolean }>();
    fields.forEach((field) => {
      const existing = this.drafts.get(field.id);
      next.set(field.id, existing ?? { key: field.id, fieldId: field.id, active: false });
    });
    this.drafts.forEach((draft, key) => {
      if (!next.has(key)) {
        this.removeDraftState(key);
      }
    });
    this.drafts = next;
  }

  private getFieldState(draftKey: string, field: ProductFieldDescriptor): ProductMassEditorFieldState {
    const linkedOptions = field.kind === "linked-element" ? this.getVisibleLinkedOptions(field) : [];
    return {
      mode: this.getFieldMode(draftKey, field),
      textValue: this.fieldTextValues.get(draftKey) ?? "",
      selectedValues: Array.from(this.getSelectedValues(draftKey)),
      linkedQuery: this.fieldLinkedQueries.get(draftKey) ?? "",
      linkedSelectedValue: this.fieldLinkedSelectedValues.get(draftKey) ?? "",
      linkedOptions,
      linkedLoading: this.fieldLinkedLoading.has(draftKey),
    };
  }

  private getFieldMode(draftKey: string, field: ProductFieldDescriptor): string {
    const stored = this.fieldModes.get(draftKey);
    if (stored) return stored;

    switch (field.kind) {
      case "text":
      case "linked-element":
        return "replace";
      case "checkbox-group":
      case "select-multiple":
        return "replace";
      case "checkbox-single":
        return "check";
    }
  }

  private getSelectedValues(draftKey: string): Set<string> {
    return this.fieldSelectedValues.get(draftKey) ?? new Set<string>();
  }

  private getVisibleLinkedOptions(field: ProductFieldDescriptor): ProductFieldOption[] {
    const draft = this.drafts.get(field.id);
    const query = draft ? (this.fieldLinkedQueries.get(draft.key) ?? "").trim().toLowerCase() : "";
    const options = this.linkedOptionsCache.get(field.searchUrl ?? "") ?? [];
    if (!query) return options.slice(0, 200);
    return options
      .filter((option) => option.label.toLowerCase().includes(query) || option.value.includes(query))
      .slice(0, 200);
  }

  private ensureLinkedOptionsIfNeeded(): void {
    const context = this.activeContext;
    if (!context) return;

    const fields = this.collectProductActionFields(context.table);
    fields.forEach((field) => {
      const draft = this.drafts.get(field.id);
      if (!draft?.active) return;
      if (field.kind !== "linked-element" || !field.searchUrl || this.linkedOptionsCache.has(field.searchUrl)) {
        return;
      }
      if (this.fieldLinkedLoading.has(draft.key)) return;

      this.fieldLinkedLoading.add(draft.key);
      this.renderUi();

      void this.resolveLinkedFieldOptions(field).finally(() => {
        this.fieldLinkedLoading.delete(draft.key);
        this.renderUi();
      });
    });
  }

  private removeDraftState(draftKey: string): void {
    this.fieldModes.delete(draftKey);
    this.fieldTextValues.delete(draftKey);
    this.fieldSelectedValues.delete(draftKey);
    this.fieldLinkedQueries.delete(draftKey);
    this.fieldLinkedSelectedValues.delete(draftKey);
    this.fieldLinkedLoading.delete(draftKey);
  }

  private collectProductActionFields(table: HTMLTableElement): ProductFieldDescriptor[] {
    const headers = Array.from(table.querySelectorAll<HTMLElement>("thead th[data-name]"));
    const skipIds = new Set(["TIMESTAMP_X", "DATE_CREATE", "ID", "NAME", "SORT", "PROPERTY_12343"]);
    const skipTitles = new Set(["Артикул"]);
    const sampleRow = this.getProductEditableRows(table)[0];
    if (!sampleRow) return [];

    const titleUsage = new Map<string, number>();
    const result: ProductFieldDescriptor[] = [];

    for (const header of headers) {
      const id = header.dataset.name?.trim();
      const title = header.querySelector<HTMLElement>(".main-grid-head-title")?.textContent?.trim();
      if (!id || !title || skipIds.has(id) || skipTitles.has(title)) continue;

      const cell = sampleRow.querySelector<HTMLElement>(`td[data-column-id="${id}"]`);
      if (!cell) continue;

      const descriptor = this.buildProductFieldDescriptor(cell, id, title);
      if (!descriptor) continue;

      titleUsage.set(title, (titleUsage.get(title) ?? 0) + 1);
      result.push(descriptor);
    }

    return result.map((field) => ({
      ...field,
      displayTitle: (titleUsage.get(field.title) ?? 0) > 1 ? `${field.title} (${field.id})` : field.title,
    }));
  }

  private buildProductFieldDescriptor(
    cell: HTMLElement,
    id: string,
    title: string,
  ): ProductFieldDescriptor | null {
    const searchButton = cell.querySelector<HTMLInputElement>('input[type="button"][value="..."]');
    if (searchButton) {
      return {
        id,
        title,
        displayTitle: title,
        kind: "linked-element",
        options: [],
        searchUrl: this.extractSearchUrl(searchButton),
      };
    }

    const select = cell.querySelector<HTMLSelectElement>("select");
    if (select) {
      return {
        id,
        title,
        displayTitle: title,
        kind: "select-multiple",
        options: Array.from(select.options)
          .filter((option) => option.value)
          .map((option) => ({ value: option.value, label: option.textContent?.trim() || option.value })),
        searchUrl: null,
      };
    }

    const checkboxes = Array.from(cell.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).filter(
      (input) => input.name,
    );
    if (checkboxes.length > 1) {
      return {
        id,
        title,
        displayTitle: title,
        kind: "checkbox-group",
        options: checkboxes.map((checkbox) => ({
          value: checkbox.value,
          label:
            cell.querySelector<HTMLLabelElement>(`label[for="${this.escapeAttributeValue(checkbox.id)}"]`)
              ?.textContent
              ?.trim() || checkbox.value,
        })),
        searchUrl: null,
      };
    }

    if (checkboxes.length === 1) {
      const checkbox = checkboxes[0];
      const label =
        cell.querySelector<HTMLLabelElement>(`label[for="${this.escapeAttributeValue(checkbox.id)}"]`)
          ?.textContent
          ?.trim() || title;

      return {
        id,
        title,
        displayTitle: title,
        kind: "checkbox-single",
        options: [{ value: checkbox.value || "Y", label }],
        searchUrl: null,
      };
    }

    const textInput =
      cell.querySelector<HTMLInputElement>('input[type="text"]') ??
      cell.querySelector<HTMLInputElement>('input.main-grid-editor-text');
    if (textInput) {
      return {
        id,
        title,
        displayTitle: title,
        kind: "text",
        options: [],
        searchUrl: null,
      };
    }

    return null;
  }

  private extractSearchUrl(button: HTMLInputElement): string | null {
    const onclick = button.getAttribute("onclick") || "";
    const match = onclick.match(/OpenWindow\('([^']+)'/);
    return match?.[1] ?? null;
  }

  private getProductEditableRows(table: HTMLTableElement): HTMLTableRowElement[] {
    return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr.main-grid-row-edit")).filter(
      (row) => row.dataset.id !== "template_0" && !row.hidden,
    );
  }

  private parseProductCodes(text: string): Set<string> {
    return new Set(
      text
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  private getMatchedProductRows(context: ProductGridContext): Array<{ element: HTMLTableRowElement; code: string }> {
    const rows = this.getProductEditableRows(context.table)
      .map((row) => {
        const codeCell = row.querySelector<HTMLElement>('td[data-column-id="PROPERTY_12343"]');
        const code = codeCell?.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return { element: row, code };
      })
      .filter((row): row is { element: HTMLTableRowElement; code: string } => Boolean(row.code));

    const codes = this.parseProductCodes(this.codes);
    return codes.size > 0 ? rows.filter((row) => codes.has(row.code)) : rows;
  }

  private async resolveLinkedFieldOptions(field: ProductFieldDescriptor): Promise<ProductFieldOption[]> {
    if (!field.searchUrl) return [];
    if (this.linkedOptionsCache.has(field.searchUrl)) {
      return this.linkedOptionsCache.get(field.searchUrl) ?? [];
    }

    try {
      const response = await fetch(field.searchUrl, { credentials: "same-origin" });
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const rows = Array.from(doc.querySelectorAll<HTMLTableRowElement>("table.adm-list-table tbody tr"));

      const options = rows
        .map((row) => {
          const cells = row.querySelectorAll<HTMLTableCellElement>("td");
          const id = cells[1]?.textContent?.trim() ?? "";
          const label = cells[5]?.childNodes[0]?.textContent?.trim() ?? cells[5]?.textContent?.trim() ?? "";
          return { value: id, label };
        })
        .filter((item) => item.value && item.label);

      this.linkedOptionsCache.set(field.searchUrl, options);
      return options;
    } catch (error) {
      console.warn("[ProductMassEditor] linked options fetch failed", error);
      return [];
    }
  }

  private applyProductMassEdit(context: ProductGridContext): void {
    const fields = this.collectProductActionFields(context.table);
    const configuredDrafts = fields
      .map((field) => {
        const draft = this.drafts.get(field.id);
        return draft?.active ? { draft, field } : null;
      })
      .filter(
        (item): item is { draft: { key: string; fieldId: string; active: boolean }; field: ProductFieldDescriptor } =>
          Boolean(item),
      );
    if (configuredDrafts.length === 0) return;

    const rows = this.getMatchedProductRows(context);
    if (rows.length === 0) {
      this.showNotification(context.table.ownerDocument, "Нет найденных товаров для применения", "warning");
      return;
    }

    let changedControls = 0;
    rows.forEach((row) => {
      configuredDrafts.forEach(({ draft, field }) => {
        changedControls += this.applyFieldToProductRow(row.element, field, draft.key);
      });
    });

    if (changedControls === 0) {
      this.showNotification(context.table.ownerDocument, "Не удалось применить изменения к выбранным полям", "warning");
      return;
    }

    this.close();
    this.showNotification(
      context.table.ownerDocument,
      `Значения подставлены: свойств ${configuredDrafts.length}, товаров ${rows.length}, изменений ${changedControls}. Теперь проверь и сохрани через Bitrix.`,
      "success",
    );
  }

  private applyFieldToProductRow(row: HTMLTableRowElement, field: ProductFieldDescriptor, draftKey: string): number {
    const cell = row.querySelector<HTMLElement>(`td[data-column-id="${field.id}"]`);
    if (!cell) return 0;

    switch (field.kind) {
      case "text":
        return this.applyTextField(cell, field, draftKey);
      case "checkbox-group":
        return this.applyCheckboxGroupField(cell, field, draftKey);
      case "select-multiple":
        return this.applySelectMultipleField(cell, field, draftKey);
      case "checkbox-single":
        return this.applySingleCheckboxField(cell, field, draftKey);
      case "linked-element":
        return this.applyLinkedElementField(cell, field, draftKey);
    }
  }

  private applyTextField(cell: HTMLElement, field: ProductFieldDescriptor, draftKey: string): number {
    const mode = this.getFieldMode(draftKey, field);
    const nextValue = this.fieldTextValues.get(draftKey) ?? "";
    const input =
      cell.querySelector<HTMLInputElement>('input[type="text"]') ??
      cell.querySelector<HTMLInputElement>('input.main-grid-editor-text');
    if (!input) return 0;

    input.value = mode === "clear" ? "" : nextValue;
    this.triggerControlUpdate(input);
    this.highlightInput(input);
    return 1;
  }

  private applyCheckboxGroupField(cell: HTMLElement, field: ProductFieldDescriptor, draftKey: string): number {
    const mode = this.getFieldMode(draftKey, field);
    const selected = this.getSelectedValues(draftKey);
    const checkboxes = Array.from(cell.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    let changed = 0;

    checkboxes.forEach((checkbox) => {
      const shouldCheck =
        mode === "clear"
          ? false
          : mode === "replace"
            ? selected.has(checkbox.value)
            : mode === "add"
              ? checkbox.checked || selected.has(checkbox.value)
              : selected.has(checkbox.value)
                ? false
                : checkbox.checked;

      if (checkbox.checked !== shouldCheck) {
        checkbox.checked = shouldCheck;
        this.triggerControlUpdate(checkbox);
        this.highlightInput(checkbox);
        changed += 1;
      }
    });

    return changed;
  }

  private applySelectMultipleField(cell: HTMLElement, field: ProductFieldDescriptor, draftKey: string): number {
    const mode = this.getFieldMode(draftKey, field);
    const selected = this.getSelectedValues(draftKey);
    const select = cell.querySelector<HTMLSelectElement>("select");
    if (!select) return 0;

    let changed = 0;
    Array.from(select.options).forEach((option) => {
      if (!option.value) return;

      const shouldSelect =
        mode === "clear"
          ? false
          : mode === "replace"
            ? selected.has(option.value)
            : mode === "add"
              ? option.selected || selected.has(option.value)
              : selected.has(option.value)
                ? false
                : option.selected;

      if (option.selected !== shouldSelect) {
        option.selected = shouldSelect;
        changed += 1;
      }
    });

    if (changed > 0) {
      this.triggerControlUpdate(select);
      this.highlightSelect(select);
    }

    return changed;
  }

  private applySingleCheckboxField(cell: HTMLElement, field: ProductFieldDescriptor, draftKey: string): number {
    const checkbox = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) return 0;

    const shouldCheck = this.getFieldMode(draftKey, field) === "check";
    if (checkbox.checked === shouldCheck) return 0;

    checkbox.checked = shouldCheck;
    this.triggerControlUpdate(checkbox);
    this.highlightInput(checkbox);
    return 1;
  }

  private applyLinkedElementField(cell: HTMLElement, field: ProductFieldDescriptor, draftKey: string): number {
    const mode = this.getFieldMode(draftKey, field);
    const input = cell.querySelector<HTMLInputElement>('input[type="text"]');
    const label = cell.querySelector<HTMLElement>("span[id^='sp_']");
    if (!input) return 0;

    if (mode === "clear") {
      input.value = "";
      if (label) label.textContent = "";
      this.triggerControlUpdate(input);
      this.highlightInput(input);
      return 1;
    }

    const selectedValue = this.fieldLinkedSelectedValues.get(draftKey);
    if (!selectedValue) return 0;

    const options = this.linkedOptionsCache.get(field.searchUrl ?? "") ?? [];
    const selectedOption = options.find((option) => option.value === selectedValue);

    input.value = selectedValue;
    if (label) {
      label.textContent = selectedOption?.label ?? "";
    }
    this.triggerControlUpdate(input);
    this.highlightInput(input);
    return 1;
  }

  private triggerControlUpdate(control: HTMLInputElement | HTMLSelectElement): void {
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private highlightInput(input: HTMLInputElement): void {
    input.style.backgroundColor = "#d1fae5";
    input.style.transition = "background-color 0.3s";
    setTimeout(() => {
      input.style.backgroundColor = "";
    }, 1500);
  }

  private highlightSelect(select: HTMLSelectElement): void {
    select.style.backgroundColor = "#d1fae5";
    select.style.transition = "background-color 0.3s";
    setTimeout(() => {
      select.style.backgroundColor = "";
    }, 1500);
  }

  private escapeAttributeValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  private showNotification(doc: Document, message: string, type: "success" | "error" | "warning"): void {
    const existing = doc.getElementById("product-mass-editor-notification");
    existing?.remove();

    const notification = doc.createElement("div");
    notification.id = "product-mass-editor-notification";
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

export const productMassEditor = new ProductMassEditor();
