import { render } from "preact";
import { debounce, getDocument } from "../../../../shared";
import { ComponentParamsVisibilityApp } from "../ui/ComponentParamsVisibilityApp";
import type {
  ComponentParamsDialogContext,
  ComponentParamsGroup,
  ComponentParamsMatrixColumn,
  ComponentParamsMatrixRow,
} from "./types";

class ComponentParamsVisibility {
  private columnSelectionsSnapshot: Map<string, { ids: Set<string>; labels: Set<string> }> | null = null;
  private snapshotRequestId = 0;
  private enabled = false;
  private observers: MutationObserver[] = [];
  private scanTimerId: number | null = null;
  private readonly debouncedCheckAndInject: () => void;
  private uiHost: HTMLDivElement | null = null;
  private activeContext: ComponentParamsDialogContext | null = null;
  private searchQuery = "";
  private readonly BUTTON_ID = "component_params_visibility_btn";
  private readonly HOST_ID = "component_params_visibility_root";
  private readonly STORAGE_PREFIX = "cnc1-component-params-visibility";
  private readonly DIALOG_ATTR = "data-cnc1-component-params-dialog";
  private readonly TABLE_ATTR = "data-cnc1-component-params-table";
  private readonly MATRIX_COLUMNS: ComponentParamsMatrixColumn[] = [
    { key: "filter", title: "Настройки фильтра", propertyIds: ["FILTER_PROPERTY_CODE"], groupIds: ["FILTER_SETTINGS"] },
    { key: "list", title: "Настройки списка", propertyIds: ["LIST_PROPERTY_CODE"], groupIds: ["LIST_SETTINGS"] },
    { key: "custom", title: "Свойства для пользовательских блоков", propertyIds: ["CUSTOM_PROPERTY_DATA"], groupIds: ["DETAIL_SETTINGS"] },
    { key: "compare", title: "Сравнение товаров", propertyIds: ["COMPARE_PROPERTY_CODE"], groupIds: ["COMPARE_SETTINGS"] },
    { key: "top", title: "Настройки TOP'а", propertyIds: ["TOP_PROPERTY_CODE"], groupIds: ["TOP_SETTINGS"] },
  ];

  constructor() {
    this.debouncedCheckAndInject = debounce(this.checkAndInject.bind(this), 250);
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.initObservers();
    this.scanTimerId = window.setInterval(() => {
      this.checkAndInject();
    }, 1000);
    this.checkAndInject();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];
    if (this.scanTimerId !== null) {
      window.clearInterval(this.scanTimerId);
      this.scanTimerId = null;
    }
    this.removeButton();
    this.unmountUi();
  }

  private initObservers(): void {
    this.observers.forEach((observer) => observer.disconnect());
    this.observers = [];

    this.getCandidateDocuments().forEach((doc) => {
      if (!doc.body) return;

      const observer = new MutationObserver(() => {
        this.debouncedCheckAndInject();
      });

      observer.observe(doc.body, { childList: true, subtree: true });
      this.observers.push(observer);
    });
  }

  private getCandidateDocuments(): Document[] {
    const docs = new Set<Document>();
    docs.add(document);

    const runtimeDoc = getDocument();
    if (runtimeDoc) {
      docs.add(runtimeDoc);
    }

    return Array.from(docs);
  }

  private checkAndInject(): void {
    const contexts = this.getCandidateDocuments().flatMap((doc) => this.findContexts(doc));
    if (contexts.length === 0) {
      this.removeButton();
      this.close();
      return;
    }

    const primaryContext = this.pickPrimaryContext(contexts);
    contexts.forEach((context) => {
      this.injectButton(context);
      const isEditingCurrentDialog = this.activeContext?.dialog === context.dialog && this.uiHost?.isConnected;
      if (!isEditingCurrentDialog) {
        this.applySavedVisibility(context);
      }
    });

    if (this.activeContext && !contexts.some((context) => context.dialog === this.activeContext?.dialog)) {
      this.close();
    }

    if (!this.activeContext && primaryContext) {
      this.applySavedVisibility(primaryContext);
    }
  }

  private findContexts(doc: Document): ComponentParamsDialogContext[] {
    const dialogs = this.findComponentDialogs(doc);
    const contexts: ComponentParamsDialogContext[] = [];

    for (const dialog of dialogs) {
      const hasComponentParamsLayout =
        !!dialog.querySelector(".bxcompprop-title") ||
        !!dialog.querySelector("#bx-comp-params-wrap") ||
        !!dialog.querySelector('form[name="bx_popup_form"]');
      if (!hasComponentParamsLayout) continue;

      const form = dialog.querySelector<HTMLFormElement>('form[name="bx_popup_form"]');
      const table = dialog.querySelector<HTMLTableElement>(".bxcompprop-content-table");
      if (table) {
        table.setAttribute(this.TABLE_ATTR, "1");
      }
      const groups = table ? this.collectGroups(table) : [];

      const title =
        dialog.querySelector<HTMLElement>(".bxcompprop-title-text-lbl")?.textContent?.trim() ||
        dialog.querySelector<HTMLElement>(".bx-core-adm-dialog-head-inner")?.textContent?.trim() ||
        "Параметры компонента";

      dialog.setAttribute(this.DIALOG_ATTR, "1");
      contexts.push({
        dialog,
        form,
        groups,
        storageKey: this.buildStorageKey(dialog, form),
        title,
      });
    }

    return contexts;
  }

  private findComponentDialogs(doc: Document): HTMLElement[] {
    return Array.from(doc.querySelectorAll<HTMLElement>(".bx-core-window.bx-core-adm-dialog")).filter((dialog) => {
      return (
        !!dialog.querySelector(".bxcompprop-title") ||
        !!dialog.querySelector("#bx-comp-params-wrap") ||
        !!dialog.querySelector(".bxcompprop-content") ||
        !!dialog.querySelector(".bxcompprop-wrap")
      );
    });
  }

  private pickPrimaryContext(contexts: ComponentParamsDialogContext[]): ComponentParamsDialogContext | null {
    if (contexts.length === 0) return null;

    const sorted = [...contexts].sort((left, right) => {
      const leftZ = Number.parseInt(left.dialog.style.zIndex || "0", 10) || 0;
      const rightZ = Number.parseInt(right.dialog.style.zIndex || "0", 10) || 0;
      return leftZ - rightZ;
    });

    return sorted.at(-1) ?? contexts[0] ?? null;
  }

  private injectButton(context: ComponentParamsDialogContext): void {
    const doc = context.dialog.ownerDocument;
    const title = context.dialog.querySelector<HTMLElement>(".bxcompprop-title");
    const titleText = title?.querySelector<HTMLElement>(".bxcompprop-title-text");
    const dialogHead = context.dialog.querySelector<HTMLElement>(".bx-core-adm-dialog-head");
    const headInner = dialogHead?.querySelector<HTMLElement>(".bx-core-adm-dialog-head-inner");
    const mountTarget = title ?? dialogHead;
    const inlineTarget = titleText ?? headInner;
    if (!mountTarget || !inlineTarget) return;

    const existingInDialog = context.dialog.querySelector<HTMLButtonElement>(`#${this.BUTTON_ID}`);
    if (existingInDialog) {
      existingInDialog.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.open(context);
      };
      return;
    }

    if (title) {
      Object.assign(title.style, {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "12px",
        flexWrap: "wrap",
      });
    }

    Object.assign(inlineTarget.style, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      minWidth: "0",
    });

    const button = doc.createElement("button");
    button.type = "button";
    button.id = this.BUTTON_ID;
    button.textContent = "Настройка списка свойств";
    button.title = "Открыть панель настройки списка свойств";
    button.className = "adm-btn";
    button.setAttribute("data-role", "component-params-visibility-button");
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.open(context);
    };

    Object.assign(button.style, {
      marginLeft: title ? "auto" : "12px",
      flex: "0 0 auto",
      whiteSpace: "nowrap",
      alignSelf: "center",
      display: "inline-flex",
      alignItems: "center",
    });

    mountTarget.appendChild(button);
  }

  private removeButton(): void {
    this.getCandidateDocuments().forEach((doc) => {
      doc.querySelectorAll<HTMLElement>(`#${this.BUTTON_ID}`).forEach((button) => button.remove());
    });
  }

  private open(context: ComponentParamsDialogContext): void {
    this.activeContext = context;
    this.columnSelectionsSnapshot = this.readCurrentColumnSelections(context.dialog);
    this.renderUi();
    void this.hydrateColumnSelections(context);
  }

  private close(): void {
    this.unmountUi();
  }

  private renderUi(): void {
    const doc = this.activeContext?.dialog.ownerDocument ?? getDocument() ?? document;
    if (!doc) return;

    const host = this.ensureUiHost(doc);
    const context = this.activeContext;
    if (!context) return;
    const rows = this.buildMatrixRows(context.dialog);

    render(
      <ComponentParamsVisibilityApp
        open={true}
        title={context.title}
        columns={this.MATRIX_COLUMNS}
        rows={rows}
        search={this.searchQuery}
        onClose={() => this.close()}
        onSearchChange={(value) => {
          this.searchQuery = value;
          this.renderUi();
        }}
      />,
      host,
    );
  }

  private ensureUiHost(doc: Document): HTMLDivElement {
    if (this.uiHost && this.uiHost.isConnected) return this.uiHost;

    const host = doc.createElement("div");
    host.id = this.HOST_ID;
    doc.body.appendChild(host);
    this.uiHost = host;
    return host;
  }

  private unmountUi(): void {
    if (!this.uiHost) return;
    render(null, this.uiHost);
    this.uiHost.remove();
    this.uiHost = null;
    this.activeContext = null;
    this.columnSelectionsSnapshot = null;
    this.snapshotRequestId += 1;
    this.searchQuery = "";
  }

  private buildMatrixRows(dialog: HTMLElement): ComponentParamsMatrixRow[] {
    const collator = new Intl.Collator("ru", { sensitivity: "base", numeric: true });
    const sourceSelect = this.findSelect(dialog, ["LIST_PROPERTY_CODE"]);
    if (!sourceSelect) return [];

    const columnSelections = this.columnSelectionsSnapshot ?? this.readCurrentColumnSelections(dialog);

    const rows = Array.from(sourceSelect.options)
      .filter((option) => option.value.trim() !== "")
      .map((option) => {
        const propertyId = option.value.trim();
        const label = this.parseOptionLabel(option, propertyId);
        const normalizedLabel = this.normalizePropertyLabel(label);
        const cells = Object.fromEntries(
          this.MATRIX_COLUMNS.map((column) => {
            const selection = columnSelections.get(column.key);
            const isActive =
              selection?.ids.has(propertyId) || (normalizedLabel ? selection?.labels.has(normalizedLabel) : false) || false;

            return [column.key, isActive];
          }),
        );

        return {
          key: propertyId,
          propertyId,
          label,
          cells,
        } satisfies ComponentParamsMatrixRow;
      });

    return rows.sort((left, right) => {
      const labelCompare = collator.compare(left.label, right.label);
      if (labelCompare !== 0) return labelCompare;
      return collator.compare(left.propertyId, right.propertyId);
    });
  }

  private findSelect(dialog: HTMLElement, propertyIds: string[]): HTMLSelectElement | null {
    for (const propertyId of propertyIds) {
      const select = dialog.querySelector<HTMLSelectElement>(`select[data-bx-property-id="${propertyId}"]`);
      if (select) return select;
    }

    return null;
  }

  private readCurrentColumnSelections(dialog: HTMLElement): Map<string, { ids: Set<string>; labels: Set<string> }> {
    const selections = new Map<string, { ids: Set<string>; labels: Set<string> }>();
    this.MATRIX_COLUMNS.forEach((column) => {
      selections.set(column.key, this.readConfiguredValues(dialog, column.propertyIds));
    });

    return selections;
  }

  private async hydrateColumnSelections(context: ComponentParamsDialogContext): Promise<void> {
    const requestId = ++this.snapshotRequestId;
    const snapshot = await this.collectSelectionsFromGroups(context.dialog);
    if (requestId !== this.snapshotRequestId) return;
    if (this.activeContext?.dialog !== context.dialog) return;

    this.columnSelectionsSnapshot = snapshot;
    this.renderUi();
  }

  private async collectSelectionsFromGroups(
    dialog: HTMLElement,
  ): Promise<Map<string, { ids: Set<string>; labels: Set<string> }>> {
    const sidebarItems = dialog.querySelectorAll<HTMLElement>(".bxcompprop-item[data-bx-comp-group-id]");
    if (sidebarItems.length === 0) {
      return this.readCurrentColumnSelections(dialog);
    }

    const snapshot = new Map<string, { ids: Set<string>; labels: Set<string> }>();
    const activeItem = dialog.querySelector<HTMLElement>(".bxcompprop-item-active[data-bx-comp-group-id]");
    const activeGroupId = activeItem?.dataset.bxCompGroupId || "";

    for (const column of this.MATRIX_COLUMNS) {
      const targetItem = this.findSidebarItem(dialog, column.groupIds ?? []);
      if (targetItem) {
        this.activateSidebarItem(targetItem);
        await this.waitForHydration();
      }

      snapshot.set(column.key, this.readConfiguredValues(dialog, column.propertyIds));
    }

    if (activeGroupId) {
      const originalItem = this.findSidebarItem(dialog, [activeGroupId]);
      if (originalItem) {
        this.activateSidebarItem(originalItem);
        await this.waitForHydration();
      }
    }

    return snapshot;
  }

  private findSidebarItem(dialog: HTMLElement, groupIds: string[]): HTMLElement | null {
    for (const groupId of groupIds) {
      const item = dialog.querySelector<HTMLElement>(`.bxcompprop-item[data-bx-comp-group-id="${groupId}"]`);
      if (item) return item;
    }

    return null;
  }

  private activateSidebarItem(item: HTMLElement): void {
    item.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: item.ownerDocument.defaultView ?? window }));
  }

  private async waitForHydration(): Promise<void> {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
  }

  private readConfiguredValues(dialog: HTMLElement, propertyIds: string[]): { ids: Set<string>; labels: Set<string> } {
    const ids = new Set<string>();
    const labels = new Set<string>();

    for (const propertyId of propertyIds) {
      const select = dialog.querySelector<HTMLSelectElement>(`select[data-bx-property-id="${propertyId}"]`);
      if (select) {
        Array.from(select.options)
          .filter((option) => option.selected && option.value.trim() !== "")
          .forEach((option) => {
            const optionValue = option.value.trim();
            ids.add(optionValue);

            const label = this.parseOptionLabel(option, optionValue);
            const normalizedLabel = this.normalizePropertyLabel(label);
            if (normalizedLabel) {
              labels.add(normalizedLabel);
            }
          });
      }

      const inputs = dialog.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        `[data-bx-property-id="${propertyId}"][name="${propertyId}[]"]`,
      );
      inputs.forEach((input) => {
        const value = input.value.trim();
        if (value) {
          ids.add(value);

          const option = select?.querySelector<HTMLOptionElement>(`option[value="${CSS.escape(value)}"]`);
          const label = option ? this.parseOptionLabel(option, value) : value;
          const normalizedLabel = this.normalizePropertyLabel(label);
          if (normalizedLabel) {
            labels.add(normalizedLabel);
          }
        }
      });
    }

    return { ids, labels };
  }

  private parseOptionLabel(option: HTMLOptionElement, propertyId: string): string {
    const raw = option.textContent?.trim() || propertyId;
    const normalized = raw.replace(/\s+/g, " ").trim();
    const prefix = `[${propertyId}]`;

    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length).trim() || propertyId;
    }

    return normalized;
  }

  private normalizePropertyLabel(label: string): string {
    return label
      .toLowerCase()
      .replace(/[_*`"'[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private collectGroups(table: HTMLTableElement): ComponentParamsGroup[] {
    const rows = Array.from(table.querySelectorAll<HTMLTableRowElement>("tr.bxcompprop-prop-tr"));
    const groups: ComponentParamsGroup[] = [];
    let currentGroup: ComponentParamsGroup | null = null;
    let groupIndex = 0;
    let rowIndex = 0;

    for (const row of rows) {
      const titleCell = row.querySelector<HTMLElement>(".bxcompprop-cont-table-title");
      if (titleCell) {
        const title = titleCell.textContent?.trim();
        if (!title) continue;

        currentGroup = {
          key: `${groupIndex++}:${title}`,
          title,
          titleRow: row,
          rows: [],
        };
        groups.push(currentGroup);
        row.dataset.componentVisibilityTitle = currentGroup.key;
        continue;
      }

      const label = row.querySelector<HTMLElement>(".bxcompprop-label")?.textContent?.trim();
      const propertyEl = row.querySelector<HTMLElement>("[data-bx-property-id]");
      if (!label || !propertyEl || !currentGroup) continue;

      const propertyId = propertyEl.getAttribute("data-bx-property-id") || "unknown";
      const rowKey = `${currentGroup.key}:${propertyId}:${rowIndex++}`;
      const item: ComponentParamsRow = {
        key: rowKey,
        groupKey: currentGroup.key,
        groupTitle: currentGroup.title,
        propertyId,
        label,
        row,
      };
      row.dataset.componentVisibilityKey = rowKey;
      currentGroup.rows.push(item);
    }

    return groups.filter((group) => group.rows.length > 0);
  }

  private buildStorageKey(dialog: HTMLElement, form: HTMLFormElement | null): string {
    const formValue = (name: string) => form?.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value?.trim() || "";
    const componentName = formValue("component_name");
    const template = formValue("component_template");
    const templateId = formValue("template_id");
    const srcPath = formValue("src_path");
    const dialogTitle =
      dialog.querySelector<HTMLElement>(".bxcompprop-title-text-lbl")?.textContent?.trim() ||
      dialog.querySelector<HTMLElement>(".bx-core-adm-dialog-head-inner")?.textContent?.trim() ||
      "dialog";

    return [
      this.STORAGE_PREFIX,
      componentName || dialogTitle,
      template || "default",
      templateId || "default",
      srcPath || "unknown",
    ].join("|");
  }

  private applySavedVisibility(_context: ComponentParamsDialogContext): void {
    // В матричном режиме настройки пока только читаются из Bitrix и не изменяют DOM таблицы.
  }

  private applyVisibilityToDialog(_context: ComponentParamsDialogContext, _visibleKeys: Set<string>): void {
    // В матричном режиме настройки пока только читаются из Bitrix и не изменяют DOM таблицы.
  }
}

export const componentParamsVisibility = new ComponentParamsVisibility();
