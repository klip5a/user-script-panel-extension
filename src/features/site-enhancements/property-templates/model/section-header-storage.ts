import { storage } from "wxt/utils/storage";

const STORAGE_KEY = "userScriptPanel.sectionTablePropertyHeaders.v1";
const MAX_SNAPSHOTS = 100;
const MAX_HEADERS = 200;
const MAX_TEXT_LENGTH = 500;

type SectionHeaderSnapshot = {
  key: string;
  headers: string[];
  url: string;
  updatedAt: string;
};

type SectionHeaderStore = {
  snapshots: SectionHeaderSnapshot[];
};

const EMPTY_STORE: SectionHeaderStore = { snapshots: [] };

const sectionHeaderStorage = storage.defineItem<SectionHeaderStore>(`local:${STORAGE_KEY}`, {
  fallback: EMPTY_STORE,
});

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStore(value: unknown): SectionHeaderStore {
  if (!isRecord(value) || !Array.isArray(value.snapshots)) return EMPTY_STORE;

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

function getParam(url: URL, names: string[]): string {
  for (const name of names) {
    const value = url.searchParams.get(name)?.trim();
    if (value) return value;
  }
  return "";
}

function readNestedReturnUrl(value: string, baseUrl: URL): string {
  try {
    const nested = new URL(value, baseUrl.origin);
    return nested.searchParams.get("return_url")?.trim() || value;
  } catch {
    return value;
  }
}

function readReturnUrl(url: URL, doc: Document): string {
  const direct = getParam(url, ["return_url", "back_url"]);
  if (direct) return readNestedReturnUrl(direct, url);

  const link = doc.querySelector<HTMLAnchorElement>('a[href*="return_url"]');
  if (!link?.href) return "";

  try {
    const linkUrl = new URL(link.href);
    const nested = getParam(linkUrl, ["return_url", "back_url"]);
    return nested ? readNestedReturnUrl(nested, linkUrl) : "";
  } catch {
    return "";
  }
}

function makePathKey(url: URL): string {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `path:${url.host}${pathname}`;
}

export function getSectionHeaderKey(doc: Document = document): string {
  const view = doc.defaultView ?? window;
  const url = new URL(view.location.href);
  const returnUrl = readReturnUrl(url, doc);

  if (returnUrl) {
    try {
      return makePathKey(new URL(returnUrl, url.origin));
    } catch {
      // Fallback to URL parameters below.
    }
  }

  const sectionId = getParam(url, ["SECTION_ID", "section_id", "filter_section", "ID"]);
  if (sectionId) {
    const iblockId = getParam(url, ["IBLOCK_ID", "iblock_id"]);
    return `section:${url.host}:${iblockId}:${sectionId}`;
  }

  return makePathKey(url);
}

export async function saveSectionPropertyHeaders(
  headers: string[],
  doc: Document = document,
): Promise<void> {
  const normalizedHeaders = headers
    .map(normalizeText)
    .filter((header) => header.length > 0 && header.length <= MAX_TEXT_LENGTH)
    .slice(0, MAX_HEADERS);
  if (normalizedHeaders.length === 0) return;

  const key = getSectionHeaderKey(doc);
  const view = doc.defaultView ?? window;
  const store = parseStore(await sectionHeaderStorage.getValue());
  const snapshot: SectionHeaderSnapshot = {
    key,
    headers: normalizedHeaders,
    url: view.location.href,
    updatedAt: new Date().toISOString(),
  };

  await sectionHeaderStorage.setValue({
    snapshots: [
      snapshot,
      ...store.snapshots.filter((item) => item.key !== key),
    ].slice(0, MAX_SNAPSHOTS),
  });
}

export async function getSectionPropertyHeaders(
  doc: Document = document,
): Promise<string[]> {
  const key = getSectionHeaderKey(doc);
  const store = parseStore(await sectionHeaderStorage.getValue());
  return store.snapshots.find((snapshot) => snapshot.key === key)?.headers ?? [];
}
