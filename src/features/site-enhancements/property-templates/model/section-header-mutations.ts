export const SECTION_HEADER_STORAGE_KEY = "userScriptPanel.sectionTablePropertyHeaders.v1";
export const MAX_SNAPSHOTS = 100;
export const MAX_HEADERS = 200;
export const MAX_TEXT_LENGTH = 500;

export type SectionHeaderSnapshot = {
  key: string;
  headers: string[];
  url: string;
  updatedAt: string;
};

export type SectionHeaderStore = {
  snapshots: SectionHeaderSnapshot[];
};

export const EMPTY_SECTION_HEADER_STORE: SectionHeaderStore = { snapshots: [] };

export function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSectionHeaderStore(value: unknown): SectionHeaderStore {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) return EMPTY_SECTION_HEADER_STORE;

  return {
    snapshots: value.snapshots
      .filter((snapshot): snapshot is SectionHeaderSnapshot => {
        return (
          isRecord(snapshot) &&
          typeof snapshot.key === "string" &&
          Array.isArray(snapshot.headers) &&
          typeof snapshot.url === "string" &&
          typeof snapshot.updatedAt === "string"
        );
      })
      .map((snapshot) => ({
        key: snapshot.key,
        headers: snapshot.headers
          .filter((header): header is string => typeof header === "string")
          .map(normalizeText)
          .filter((header) => header.length > 0 && header.length <= MAX_TEXT_LENGTH)
          .slice(0, MAX_HEADERS),
        url: snapshot.url,
        updatedAt: snapshot.updatedAt,
      }))
      .filter((snapshot) => snapshot.key.length > 0 && snapshot.headers.length > 0)
      .slice(0, MAX_SNAPSHOTS),
  };
}

export function buildSectionHeaderSnapshot(
  key: string,
  headers: string[],
  url: string,
  now: string,
): SectionHeaderSnapshot {
  const normalizedKey = normalizeText(key);
  const normalizedHeaders = headers
    .map(normalizeText)
    .filter((header) => header.length > 0 && header.length <= MAX_TEXT_LENGTH)
    .slice(0, MAX_HEADERS);

  if (!normalizedKey || normalizedHeaders.length === 0) {
    throw new Error("Некорректные заголовки шапки раздела.");
  }

  return {
    key: normalizedKey,
    headers: normalizedHeaders,
    url: normalizeText(url),
    updatedAt: now,
  };
}

/**
 * Чистый upsert снимка шапки по key: старые записи для того же раздела заменяются,
 * остальные snapshots сохраняются без потерь.
 */
export function saveSectionHeaderSnapshotInStore(
  store: SectionHeaderStore,
  snapshot: SectionHeaderSnapshot,
): SectionHeaderStore {
  const normalizedStore = parseSectionHeaderStore(store);
  const normalizedSnapshot = buildSectionHeaderSnapshot(
    snapshot.key,
    snapshot.headers,
    snapshot.url,
    snapshot.updatedAt,
  );

  return {
    snapshots: [
      normalizedSnapshot,
      ...normalizedStore.snapshots.filter((item) => item.key !== normalizedSnapshot.key),
    ].slice(0, MAX_SNAPSHOTS),
  };
}
