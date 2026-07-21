import { debounce } from "../../../shared";
import {
  deletePropertyTemplate,
  getPropertyTemplateStore,
  upsertPropertyTemplate,
} from "./model/storage";
import { downloadPropertyTemplateStore } from "./model/download";
import type { PropertyTemplate, PropertyTemplateItem } from "./model/types";

type PropertyBlockContext = {
  container: HTMLTableElement;
  prefix: string;
  addButton: HTMLInputElement;
};

const PROPERTY_SELECT_PATTERN = /^(UF_PROPS_PRODUCT(?:_DETAIL)?_T)\[(\d+)]\[VALUE]$/;
const TOOLBAR_CLASS = "cnc1-property-template-toolbar";
const DIALOG_CLASS = "cnc1-property-template-dialog";
const STYLES_ID = "cnc1-property-template-styles";

const STYLES = `
  .${TOOLBAR_CLASS} {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-left: 8px;
    vertical-align: middle;
  }
  .${TOOLBAR_CLASS} button,
  .${DIALOG_CLASS} button {
    min-height: 29px;
    padding: 5px 12px;
    border: 1px solid #c6cdd3;
    border-radius: 3px;
    background: linear-gradient(#fff, #e8edf1);
    color: #333;
    cursor: pointer;
    font: 13px/1.2 Arial, sans-serif;
  }
  .${TOOLBAR_CLASS} button:hover,
  .${DIALOG_CLASS} button:hover {
    border-color: #9ca8b3;
    background: #f4f7f8;
  }
  .${DIALOG_CLASS} {
    width: min(520px, calc(100vw - 32px));
    max-height: min(640px, calc(100vh - 32px));
    padding: 0;
    border: 0;
    border-radius: 8px;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
    color: #222;
    font: 14px/1.4 Arial, sans-serif;
  }
  .${DIALOG_CLASS}::backdrop {
    background: rgba(18, 26, 33, 0.45);
  }
  .cnc1-property-template-dialog__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid #dce2e6;
  }
  .cnc1-property-template-dialog__header strong {
    font-size: 16px;
  }
  .cnc1-property-template-dialog__header button {
    min-width: 32px;
    padding: 4px 8px;
  }
  .cnc1-property-template-dialog__list {
    display: grid;
    gap: 8px;
    max-height: 480px;
    overflow: auto;
    padding: 14px 18px 18px;
  }
  .cnc1-property-template-dialog__item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 8px;
    padding: 10px;
    border: 1px solid #dce2e6;
    border-radius: 6px;
    background: #fff;
  }
  .cnc1-property-template-dialog__item span {
    min-width: 0;
  }
  .cnc1-property-template-dialog__item strong,
  .cnc1-property-template-dialog__item small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cnc1-property-template-dialog__item small,
  .cnc1-property-template-dialog__empty {
    color: #66737f;
  }
  .cnc1-property-template-dialog__delete {
    color: #b42318 !important;
  }
`;

class PropertyTemplates {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private readonly scanDebounced = debounce(() => this.scan(), 200);

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.injectStyles();
    this.scan();

    this.observer = new MutationObserver(() => this.scanDebounced());
    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.observer?.disconnect();
    this.observer = null;
    document.querySelectorAll(`.${TOOLBAR_CLASS}`).forEach((toolbar) => toolbar.remove());
    document.querySelectorAll(`.${DIALOG_CLASS}`).forEach((dialog) => dialog.remove());
  }

  private injectStyles(): void {
    if (document.getElementById(STYLES_ID)) return;
    const style = document.createElement("style");
    style.id = STYLES_ID;
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  private scan(): void {
    if (!this.enabled) return;

    const seen = new Set<HTMLTableElement>();
    document.querySelectorAll<HTMLSelectElement>('select[name*="UF_PROPS_PRODUCT"]').forEach((select) => {
      const match = select.name.match(PROPERTY_SELECT_PATTERN);
      if (!match) return;

      const context = this.findBlockContext(select, match[1]);
      if (!context || seen.has(context.container)) return;
      seen.add(context.container);
      this.injectToolbar(context);
    });
  }

  private findBlockContext(select: HTMLSelectElement, prefix: string): PropertyBlockContext | null {
    let element: HTMLElement | null = select.parentElement;

    while (element) {
      if (element instanceof HTMLTableElement) {
        const addButton = Array.from(
          element.querySelectorAll<HTMLInputElement>('input[type="button"][onclick*="addNewRow"]'),
        ).find((button) => button.getAttribute("onclick")?.includes(`'${prefix}'`));

        if (addButton) {
          return { container: element, prefix, addButton };
        }
      }
      element = element.parentElement;
    }

    return null;
  }

  private injectToolbar(context: PropertyBlockContext): void {
    const host = context.addButton.parentElement;
    if (!host || host.querySelector(`.${TOOLBAR_CLASS}[data-prefix="${context.prefix}"]`)) return;

    const toolbar = document.createElement("span");
    toolbar.className = TOOLBAR_CLASS;
    toolbar.dataset.prefix = context.prefix;

    const createButton = document.createElement("button");
    createButton.type = "button";
    createButton.textContent = "Создать шаблон";
    createButton.addEventListener("click", () => void this.createTemplate(context));

    const insertButton = document.createElement("button");
    insertButton.type = "button";
    insertButton.textContent = "Вставить шаблон";
    insertButton.addEventListener("click", () => void this.openTemplatePicker(context));

    toolbar.append(createButton, insertButton);
    context.addButton.insertAdjacentElement("afterend", toolbar);
  }

  private collectItems(context: PropertyBlockContext): PropertyTemplateItem[] {
    return this.getPropertySelects(context)
      .map(({ select, index }) => {
        const name = this.findInput(context.container, context.prefix, index, "NAME")?.value ?? "";
        const sort = this.findInput(context.container, context.prefix, index, "SORT")?.value ?? "";
        return { value: select.value.trim(), name: name.trim(), sort: sort.trim() };
      })
      .filter((item) => item.value && item.value !== "-");
  }

  private getPropertySelects(
    context: PropertyBlockContext,
  ): Array<{ select: HTMLSelectElement; index: number }> {
    return Array.from(context.container.querySelectorAll<HTMLSelectElement>("select"))
      .map((select) => {
        const match = select.name.match(PROPERTY_SELECT_PATTERN);
        return match?.[1] === context.prefix
          ? { select, index: Number.parseInt(match[2], 10) }
          : null;
      })
      .filter((entry): entry is { select: HTMLSelectElement; index: number } => entry !== null)
      .sort((left, right) => left.index - right.index);
  }

  private findInput(
    container: ParentNode,
    prefix: string,
    index: number,
    field: "NAME" | "SORT",
  ): HTMLInputElement | null {
    const name = `${prefix}[${index}][${field}]`;
    return container.querySelector<HTMLInputElement>(`input[name="${CSS.escape(name)}"]`);
  }

  private async createTemplate(context: PropertyBlockContext): Promise<void> {
    const view = context.container.ownerDocument.defaultView ?? window;
    const items = this.collectItems(context);
    if (items.length === 0) {
      view.alert("Нет выбранных свойств для сохранения.");
      return;
    }

    const enteredName = view.prompt("Название шаблона:");
    const name = enteredName?.trim();
    if (!name) return;

    const store = await getPropertyTemplateStore();
    const existing = store.templates.find(
      (template) => template.name.localeCompare(name, "ru", { sensitivity: "base" }) === 0,
    );
    if (existing && !view.confirm(`Шаблон «${existing.name}» уже существует. Заменить его?`)) {
      return;
    }

    try {
      const savedTemplate = await upsertPropertyTemplate(name, items);
      const updatedStore = await getPropertyTemplateStore();
      if (!updatedStore.templates.some((template) => template.id === savedTemplate.id)) {
        throw new Error("Шаблон не найден после сохранения.");
      }
      downloadPropertyTemplateStore(updatedStore, context.container.ownerDocument);
      view.alert(`Шаблон «${name}» сохранён: ${items.length} свойств.`);
    } catch (error) {
      view.alert(error instanceof Error ? error.message : "Не удалось сохранить шаблон.");
    }
  }

  private async openTemplatePicker(context: PropertyBlockContext): Promise<void> {
    const doc = context.container.ownerDocument;
    doc.querySelector(`.${DIALOG_CLASS}`)?.remove();

    const dialog = doc.createElement("dialog");
    dialog.className = DIALOG_CLASS;
    dialog.addEventListener("close", () => dialog.remove(), { once: true });

    const header = doc.createElement("div");
    header.className = "cnc1-property-template-dialog__header";
    const title = doc.createElement("strong");
    title.textContent = "Вставить шаблон";
    const closeButton = doc.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "×";
    closeButton.title = "Закрыть";
    closeButton.addEventListener("click", () => dialog.close());
    header.append(title, closeButton);

    const list = doc.createElement("div");
    list.className = "cnc1-property-template-dialog__list";
    dialog.append(header, list);
    doc.body.appendChild(dialog);

    await this.renderTemplateList(context, dialog, list);
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  private async renderTemplateList(
    context: PropertyBlockContext,
    dialog: HTMLDialogElement,
    list: HTMLElement,
  ): Promise<void> {
    const store = await getPropertyTemplateStore();
    list.replaceChildren();

    if (store.templates.length === 0) {
      const empty = document.createElement("p");
      empty.className = "cnc1-property-template-dialog__empty";
      empty.textContent = "Сохранённых шаблонов пока нет.";
      list.appendChild(empty);
      return;
    }

    [...store.templates]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .forEach((template) => list.appendChild(this.createTemplateListItem(context, dialog, list, template)));
  }

  private createTemplateListItem(
    context: PropertyBlockContext,
    dialog: HTMLDialogElement,
    list: HTMLElement,
    template: PropertyTemplate,
  ): HTMLElement {
    const doc = context.container.ownerDocument;
    const row = doc.createElement("div");
    row.className = "cnc1-property-template-dialog__item";

    const description = doc.createElement("span");
    const name = doc.createElement("strong");
    name.textContent = template.name;
    const count = doc.createElement("small");
    count.textContent = `${template.items.length} свойств`;
    description.append(name, count);

    const insertButton = doc.createElement("button");
    insertButton.type = "button";
    insertButton.textContent = "Вставить";
    insertButton.addEventListener("click", async () => {
      insertButton.disabled = true;
      const result = await this.insertTemplate(context, template);
      dialog.close();
      (doc.defaultView ?? window).alert(
        `Шаблон «${template.name}»: добавлено ${result.added}, пропущено ${result.skipped}.`,
      );
    });

    const deleteButton = doc.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "cnc1-property-template-dialog__delete";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", async () => {
      const view = doc.defaultView ?? window;
      if (!view.confirm(`Удалить шаблон «${template.name}»?`)) return;
      await deletePropertyTemplate(template.id);
      await this.renderTemplateList(context, dialog, list);
    });

    row.append(description, insertButton, deleteButton);
    return row;
  }

  private async insertTemplate(
    context: PropertyBlockContext,
    template: PropertyTemplate,
  ): Promise<{ added: number; skipped: number }> {
    let added = 0;
    let skipped = 0;

    for (const item of template.items) {
      const referenceSelect = this.getPropertySelects(context)[0]?.select;
      const optionExists = referenceSelect
        ? Array.from(referenceSelect.options).some((option) => option.value === item.value)
        : false;
      if (!optionExists) {
        skipped += 1;
        continue;
      }

      const existingNames = new Set(this.getPropertySelects(context).map(({ select }) => select.name));
      context.addButton.click();
      const created = await this.waitForNewSelect(context, existingNames);
      if (!created) {
        skipped += 1;
        continue;
      }

      const match = created.name.match(PROPERTY_SELECT_PATTERN);
      if (!match) {
        skipped += 1;
        continue;
      }

      const index = Number.parseInt(match[2], 10);
      this.setControlValue(created, item.value);
      const nameInput = this.findInput(context.container, context.prefix, index, "NAME");
      const sortInput = this.findInput(context.container, context.prefix, index, "SORT");
      if (nameInput) this.setControlValue(nameInput, item.name);
      if (sortInput) this.setControlValue(sortInput, item.sort);
      added += 1;
    }

    return { added, skipped };
  }

  private waitForNewSelect(
    context: PropertyBlockContext,
    existingNames: Set<string>,
  ): Promise<HTMLSelectElement | null> {
    const findCreated = () =>
      this.getPropertySelects(context)
        .map(({ select }) => select)
        .find((select) => !existingNames.has(select.name)) ?? null;

    const immediate = findCreated();
    if (immediate) return Promise.resolve(immediate);

    return new Promise((resolve) => {
      let settled = false;
      const finish = (select: HTMLSelectElement | null) => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        window.clearTimeout(timeoutId);
        resolve(select);
      };
      const observer = new MutationObserver(() => {
        const created = findCreated();
        if (created) finish(created);
      });
      const timeoutId = window.setTimeout(() => finish(null), 2000);
      observer.observe(context.container, { childList: true, subtree: true });
    });
  }

  private setControlValue(control: HTMLInputElement | HTMLSelectElement, value: string): void {
    control.value = value;
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

export const propertyTemplates = new PropertyTemplates();
