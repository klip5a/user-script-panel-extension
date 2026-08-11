import { browser } from "wxt/browser";
import type {
  StoreMutationRequest,
  StoreMutationResponse,
} from "./coordinator";
import { parsePropertyTemplateItem, parsePropertyTemplateStore } from "./parse";
import type { PropertyTemplate, PropertyTemplateItem, PropertyTemplateStore } from "./types";

async function sendStoreMutation<T>(
  message: StoreMutationRequest,
): Promise<T> {
  const response = (await browser.runtime.sendMessage(message)) as StoreMutationResponse;
  if (!response?.ok) {
    throw new Error(response?.error ?? "Не удалось выполнить операцию над хранилищем.");
  }
  return response.data as T;
}

export async function upsertPropertyTemplate(
  name: string,
  items: PropertyTemplateItem[],
): Promise<PropertyTemplate> {
  // Валидируем на клиенте до отправки, чтобы не гонять заведомо битые payload'ы.
  const validatedItems = items.map((item, index) => parsePropertyTemplateItem(item, index));
  return sendStoreMutation<PropertyTemplate>({
    type: "propertyTemplates:upsert",
    payload: { name, items: validatedItems },
  });
}

export async function deletePropertyTemplate(id: string): Promise<void> {
  await sendStoreMutation<PropertyTemplateStore>({
    type: "propertyTemplates:delete",
    payload: { id },
  });
}

export async function mergePropertyTemplateStore(
  imported: PropertyTemplateStore,
): Promise<PropertyTemplateStore> {
  const validated = parsePropertyTemplateStore(imported);
  return sendStoreMutation<PropertyTemplateStore>({
    type: "propertyTemplates:merge",
    payload: { store: validated },
  });
}

export async function sendSectionHeaderSave(payload: {
  key: string;
  headers: string[];
  url: string;
}): Promise<void> {
  await sendStoreMutation<unknown>({
    type: "sectionHeaders:save",
    payload,
  });
}
