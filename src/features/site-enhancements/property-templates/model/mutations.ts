import {
  MAX_TEMPLATES,
  parsePropertyTemplateItem,
  parsePropertyTemplateStore,
  readString,
} from "./parse";
import {
  PROPERTY_TEMPLATE_SCHEMA_VERSION,
  type PropertyTemplate,
  type PropertyTemplateItem,
  type PropertyTemplateStore,
} from "./types";

export type UpsertTemplateResult = {
  store: PropertyTemplateStore;
  template: PropertyTemplate;
};

/**
 * Чистый read-modify-write шага upsert: не трогает storage и browser APIs,
 * поэтому покрывается unit-тестами без потери посторонних записей.
 */
export function upsertTemplateInStore(
  store: PropertyTemplateStore,
  name: string,
  items: PropertyTemplateItem[],
  now: string,
  generateId: () => string,
): UpsertTemplateResult {
  const normalizedStore = parsePropertyTemplateStore(store);
  const normalizedName = readString(name, "name");
  const normalizedItems = items.map(parsePropertyTemplateItem);
  if (normalizedItems.length === 0) {
    throw new Error("В шаблоне нет выбранных свойств.");
  }

  const existingIndex = normalizedStore.templates.findIndex(
    (template) =>
      template.name.localeCompare(normalizedName, "ru", { sensitivity: "base" }) === 0,
  );
  const existing =
    existingIndex >= 0 ? normalizedStore.templates[existingIndex] : undefined;
  const template: PropertyTemplate = {
    id: existing?.id ?? generateId(),
    name: normalizedName,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    items: normalizedItems,
  };

  const templates = [...normalizedStore.templates];
  if (existingIndex >= 0) {
    templates[existingIndex] = template;
  } else {
    if (templates.length >= MAX_TEMPLATES) {
      throw new Error(`Достигнут лимит: ${MAX_TEMPLATES} шаблонов.`);
    }
    templates.push(template);
  }

  return {
    store: { version: PROPERTY_TEMPLATE_SCHEMA_VERSION, templates },
    template,
  };
}

export function deleteTemplateFromStore(
  store: PropertyTemplateStore,
  id: string,
): PropertyTemplateStore {
  const normalizedStore = parsePropertyTemplateStore(store);
  const normalizedId = readString(id, "id");

  return {
    version: PROPERTY_TEMPLATE_SCHEMA_VERSION,
    templates: normalizedStore.templates.filter((template) => template.id !== normalizedId),
  };
}

/**
 * Merge по id: приходящие шаблоны заменяют одноимённые, остальные записи
 * текущего store сохраняются (импорт не теряет параллельные изменения).
 */
export function mergeTemplateStores(
  current: PropertyTemplateStore,
  imported: PropertyTemplateStore,
): PropertyTemplateStore {
  const normalizedCurrent = parsePropertyTemplateStore(current);
  const normalizedImported = parsePropertyTemplateStore(imported);
  const merged = new Map(
    normalizedCurrent.templates.map((template) => [template.id, template]),
  );

  normalizedImported.templates.forEach((template) => merged.set(template.id, template));
  const templates = Array.from(merged.values());
  if (templates.length > MAX_TEMPLATES) {
    throw new Error(`После импорта будет превышен лимит: ${MAX_TEMPLATES} шаблонов.`);
  }

  return { version: PROPERTY_TEMPLATE_SCHEMA_VERSION, templates };
}
