import {
  deleteTemplateFromStore,
  mergeTemplateStores,
  upsertTemplateInStore,
} from "./mutations";
import {
  parsePropertyTemplateItem,
  parsePropertyTemplateStore,
  PROPERTY_TEMPLATE_STORAGE_KEY,
  emptyPropertyTemplateStore,
} from "./parse";
import {
  buildSectionHeaderSnapshot,
  EMPTY_SECTION_HEADER_STORE,
  parseSectionHeaderStore,
  saveSectionHeaderSnapshotInStore,
  SECTION_HEADER_STORAGE_KEY,
} from "./section-header-mutations";
import type { PropertyTemplateItem, PropertyTemplateStore } from "./types";

export type StoreMutationRequest =
  | {
      type: "propertyTemplates:upsert";
      payload: { name: string; items: PropertyTemplateItem[] };
    }
  | { type: "propertyTemplates:delete"; payload: { id: string } }
  | {
      type: "propertyTemplates:merge";
      payload: { store: PropertyTemplateStore };
    }
  | {
      type: "sectionHeaders:save";
      payload: { key: string; headers: string[]; url: string };
    };

export type StoreMutationSuccess = { ok: true; data?: unknown };
export type StoreMutationFailure = { ok: false; error: string };
export type StoreMutationResponse = StoreMutationSuccess | StoreMutationFailure;

const MUTATION_TYPES = new Set<string>([
  "propertyTemplates:upsert",
  "propertyTemplates:delete",
  "propertyTemplates:merge",
  "sectionHeaders:save",
]);

export function isStoreMutationMessage(value: unknown): value is StoreMutationRequest {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { type?: unknown };
  return typeof candidate.type === "string" && MUTATION_TYPES.has(candidate.type);
}

export type StorageAreaLike = {
  get: <T extends Record<string, unknown>>(defaults: T) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
};

/**
 * Последовательная очередь: задачи исполняются в порядке поступления, причём
 * reject одной задачи не останавливает следующие.
 */
export function createMutationQueue() {
  let chain: Promise<unknown> = Promise.resolve();

  return {
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      const result = chain.then(task, task);
      chain = result.catch(() => undefined);
      return result;
    },
  };
}

function serializeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Authoritative background-координатор: каждая мутация читает актуальное значение
 * хранилища непосредственно перед операцией и пишет результат одной записью.
 * Чтения и watch-подписки остаются в вызывающих контекстах.
 */
export function createStoreMutationHandler(
  storageArea: StorageAreaLike,
  now: () => string = () => new Date().toISOString(),
  generateId: () => string = () => crypto.randomUUID(),
) {
  async function handle(message: StoreMutationRequest): Promise<StoreMutationResponse> {
    try {
      switch (message.type) {
        case "propertyTemplates:upsert": {
          const items = Array.isArray(message.payload.items)
            ? message.payload.items.map((item, index) =>
                parsePropertyTemplateItem(item, index),
              )
            : [];
          const stored = await storageArea.get({ [PROPERTY_TEMPLATE_STORAGE_KEY]: null });
          const rawStore = stored[PROPERTY_TEMPLATE_STORAGE_KEY];
          const store =
            rawStore == null ? emptyPropertyTemplateStore() : parsePropertyTemplateStore(rawStore);
          const result = upsertTemplateInStore(
            store,
            message.payload.name,
            items,
            now(),
            generateId,
          );
          await storageArea.set({ [PROPERTY_TEMPLATE_STORAGE_KEY]: result.store });
          return { ok: true, data: result.template };
        }

        case "propertyTemplates:delete": {
          const stored = await storageArea.get({ [PROPERTY_TEMPLATE_STORAGE_KEY]: null });
          const rawStore = stored[PROPERTY_TEMPLATE_STORAGE_KEY];
          const store =
            rawStore == null ? emptyPropertyTemplateStore() : parsePropertyTemplateStore(rawStore);
          const nextStore = deleteTemplateFromStore(store, message.payload.id);
          await storageArea.set({ [PROPERTY_TEMPLATE_STORAGE_KEY]: nextStore });
          return { ok: true, data: nextStore };
        }

        case "propertyTemplates:merge": {
          const imported = parsePropertyTemplateStore(message.payload.store);
          const stored = await storageArea.get({ [PROPERTY_TEMPLATE_STORAGE_KEY]: null });
          const rawStore = stored[PROPERTY_TEMPLATE_STORAGE_KEY];
          const store =
            rawStore == null ? emptyPropertyTemplateStore() : parsePropertyTemplateStore(rawStore);
          const nextStore = mergeTemplateStores(store, imported);
          await storageArea.set({ [PROPERTY_TEMPLATE_STORAGE_KEY]: nextStore });
          return { ok: true, data: nextStore };
        }

        case "sectionHeaders:save": {
          const snapshot = buildSectionHeaderSnapshot(
            message.payload.key,
            message.payload.headers,
            message.payload.url,
            now(),
          );
          const stored = await storageArea.get({ [SECTION_HEADER_STORAGE_KEY]: null });
          const rawStore = stored[SECTION_HEADER_STORAGE_KEY];
          const store =
            rawStore == null ? EMPTY_SECTION_HEADER_STORE : parseSectionHeaderStore(rawStore);
          const nextStore = saveSectionHeaderSnapshotInStore(store, snapshot);
          await storageArea.set({ [SECTION_HEADER_STORAGE_KEY]: nextStore });
          return { ok: true, data: nextStore };
        }
      }
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    }

    return { ok: false, error: "Неизвестная операция над хранилищем." };
  }

  return handle;
}
