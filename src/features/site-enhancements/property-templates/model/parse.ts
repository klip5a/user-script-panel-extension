import {
  EMPTY_PROPERTY_TEMPLATE_STORE,
  PROPERTY_TEMPLATE_SCHEMA_VERSION,
  type PropertyTemplate,
  type PropertyTemplateItem,
  type PropertyTemplateStore,
} from "./types";

export const PROPERTY_TEMPLATE_STORAGE_KEY = "userScriptPanel.propertyTemplates.v1";
export const MAX_TEMPLATES = 200;
export const MAX_ITEMS_PER_TEMPLATE = 500;
export const MAX_TEXT_LENGTH = 500;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(value: unknown, field: string, allowEmpty = false): string {
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

export function parsePropertyTemplateItem(value: unknown, index: number): PropertyTemplateItem {
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
    items: value.items.map(parsePropertyTemplateItem),
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

export function emptyPropertyTemplateStore(): PropertyTemplateStore {
  return { ...EMPTY_PROPERTY_TEMPLATE_STORE, templates: [] };
}
