import { storage } from "wxt/utils/storage";
import {
  EMPTY_PROPERTY_TEMPLATE_STORE,
  PROPERTY_TEMPLATE_SCHEMA_VERSION,
  type PropertyTemplate,
  type PropertyTemplateItem,
  type PropertyTemplateStore,
} from "./types";

const STORAGE_KEY = "userScriptPanel.propertyTemplates.v1";
const MAX_TEMPLATES = 200;
const MAX_ITEMS_PER_TEMPLATE = 500;
const MAX_TEXT_LENGTH = 500;
const propertyTemplateStorage = storage.defineItem<PropertyTemplateStore>(
  `local:${STORAGE_KEY}`,
  { fallback: EMPTY_PROPERTY_TEMPLATE_STORE },
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string") {
    throw new Error(`Поле ${field} должно быть строкой.`);
  }

  const normalized = value.trim();
  if (!allowEmpty && !normalized) {
    throw new Error(`Поле ${field} не может быть пустым.`);
  }
  if (normalized.length > MAX_TEXT_LENGTH) {
    throw new Error(`Поле ${field} слишком длинное.`);
  }

  return normalized;
}

function parseItem(value: unknown, index: number): PropertyTemplateItem {
  if (!isRecord(value)) {
    throw new Error(`Строка шаблона ${index + 1} имеет неверный формат.`);
  }

  return {
    value: readString(value.value, `templates.items[${index}].value`),
    name: readString(value.name, `templates.items[${index}].name`, true),
    sort: readString(value.sort, `templates.items[${index}].sort`, true),
  };
}

function parseTemplate(value: unknown, index: number): PropertyTemplate {
  if (!isRecord(value)) {
    throw new Error(`Шаблон ${index + 1} имеет неверный формат.`);
  }
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS_PER_TEMPLATE) {
    throw new Error(`Шаблон ${index + 1} содержит недопустимое количество строк.`);
  }

  return {
    id: readString(value.id, `templates[${index}].id`),
    name: readString(value.name, `templates[${index}].name`),
    createdAt: readString(value.createdAt, `templates[${index}].createdAt`),
    updatedAt: readString(value.updatedAt, `templates[${index}].updatedAt`),
    items: value.items.map(parseItem),
  };
}

export function parsePropertyTemplateStore(value: unknown): PropertyTemplateStore {
  if (!isRecord(value) || value.version !== PROPERTY_TEMPLATE_SCHEMA_VERSION) {
    throw new Error("Неподдерживаемая версия файла шаблонов.");
  }
  if (!Array.isArray(value.templates) || value.templates.length > MAX_TEMPLATES) {
    throw new Error("Некорректный список шаблонов.");
  }

  const templates = value.templates.map(parseTemplate);
  if (new Set(templates.map((template) => template.id)).size !== templates.length) {
    throw new Error("В файле найдены повторяющиеся идентификаторы шаблонов.");
  }

  return { version: PROPERTY_TEMPLATE_SCHEMA_VERSION, templates };
}

export function parsePropertyTemplateJson(json: string): PropertyTemplateStore {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error("Файл не является корректным JSON.");
  }

  return parsePropertyTemplateStore(value);
}

export async function getPropertyTemplateStore(): Promise<PropertyTemplateStore> {
  try {
    return parsePropertyTemplateStore(await propertyTemplateStorage.getValue());
  } catch (error) {
    console.warn("[PropertyTemplates] Не удалось прочитать сохранённые шаблоны:", error);
    return { ...EMPTY_PROPERTY_TEMPLATE_STORE, templates: [] };
  }
}

export async function setPropertyTemplateStore(store: PropertyTemplateStore): Promise<void> {
  const validated = parsePropertyTemplateStore(store);
  await propertyTemplateStorage.setValue(validated);
}

export async function upsertPropertyTemplate(
  name: string,
  items: PropertyTemplateItem[],
): Promise<PropertyTemplate> {
  const store = await getPropertyTemplateStore();
  const normalizedName = readString(name, "name");
  const normalizedItems = items.map(parseItem);
  if (normalizedItems.length === 0) {
    throw new Error("В шаблоне нет выбранных свойств.");
  }

  const now = new Date().toISOString();
  const existingIndex = store.templates.findIndex(
    (template) => template.name.localeCompare(normalizedName, "ru", { sensitivity: "base" }) === 0,
  );
  const existing = existingIndex >= 0 ? store.templates[existingIndex] : undefined;
  const template: PropertyTemplate = {
    id: existing?.id ?? crypto.randomUUID(),
    name: normalizedName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    items: normalizedItems,
  };

  const templates = [...store.templates];
  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    if (templates.length >= MAX_TEMPLATES) {
      throw new Error(`Достигнут лимит: ${MAX_TEMPLATES} шаблонов.`);
    }
    templates.push(template);
  }

  await setPropertyTemplateStore({ version: PROPERTY_TEMPLATE_SCHEMA_VERSION, templates });
  return template;
}

export async function deletePropertyTemplate(id: string): Promise<void> {
  const store = await getPropertyTemplateStore();
  await setPropertyTemplateStore({
    version: PROPERTY_TEMPLATE_SCHEMA_VERSION,
    templates: store.templates.filter((template) => template.id !== id),
  });
}

export async function mergePropertyTemplateStore(
  imported: PropertyTemplateStore,
): Promise<PropertyTemplateStore> {
  const incoming = parsePropertyTemplateStore(imported);
  const current = await getPropertyTemplateStore();
  const merged = new Map(current.templates.map((template) => [template.id, template]));

  incoming.templates.forEach((template) => merged.set(template.id, template));
  const templates = Array.from(merged.values());
  if (templates.length > MAX_TEMPLATES) {
    throw new Error(`После импорта будет превышен лимит: ${MAX_TEMPLATES} шаблонов.`);
  }

  const result: PropertyTemplateStore = {
    version: PROPERTY_TEMPLATE_SCHEMA_VERSION,
    templates,
  };
  await setPropertyTemplateStore(result);
  return result;
}

export function subscribeToPropertyTemplates(
  callback: (store: PropertyTemplateStore) => void,
): () => void {
  return propertyTemplateStorage.watch((newValue) => {
    try {
      callback(parsePropertyTemplateStore(newValue));
    } catch (error) {
      console.warn("[PropertyTemplates] Получено некорректное изменение storage:", error);
      callback({ ...EMPTY_PROPERTY_TEMPLATE_STORE, templates: [] });
    }
  });
}
