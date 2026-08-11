import { storage } from "wxt/utils/storage";
import {
  deletePropertyTemplate,
  mergePropertyTemplateStore,
  upsertPropertyTemplate,
} from "./client";
import {
  emptyPropertyTemplateStore,
  parsePropertyTemplateStore,
  PROPERTY_TEMPLATE_STORAGE_KEY,
} from "./parse";
import {
  EMPTY_PROPERTY_TEMPLATE_STORE,
  type PropertyTemplateStore,
} from "./types";

const propertyTemplateStorage = storage.defineItem<PropertyTemplateStore>(
  `local:${PROPERTY_TEMPLATE_STORAGE_KEY}`,
  { fallback: EMPTY_PROPERTY_TEMPLATE_STORE },
);

export async function getPropertyTemplateStore(): Promise<PropertyTemplateStore> {
  try {
    return parsePropertyTemplateStore(await propertyTemplateStorage.getValue());
  } catch (error) {
    console.warn("[PropertyTemplates] Не удалось прочитать сохранённые шаблоны:", error);
    return emptyPropertyTemplateStore();
  }
}

export async function setPropertyTemplateStore(store: PropertyTemplateStore): Promise<void> {
  const validated = parsePropertyTemplateStore(store);
  await propertyTemplateStorage.setValue(validated);
}

export function subscribeToPropertyTemplates(
  callback: (store: PropertyTemplateStore) => void,
): () => void {
  return propertyTemplateStorage.watch((newValue) => {
    try {
      callback(parsePropertyTemplateStore(newValue));
    } catch (error) {
      console.warn("[PropertyTemplates] Получено некорректное изменение storage:", error);
      callback(emptyPropertyTemplateStore());
    }
  });
}

export {
  deletePropertyTemplate,
  mergePropertyTemplateStore,
  upsertPropertyTemplate,
};
export { parsePropertyTemplateJson, parsePropertyTemplateStore } from "./parse";
