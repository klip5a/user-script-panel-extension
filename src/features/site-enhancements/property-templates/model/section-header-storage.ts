import { storage } from "wxt/utils/storage";
import { sendSectionHeaderSave } from "./client";
import {
  EMPTY_SECTION_HEADER_STORE,
  MAX_HEADERS,
  MAX_TEXT_LENGTH,
  normalizeText,
  parseSectionHeaderStore,
  SECTION_HEADER_STORAGE_KEY,
  type SectionHeaderStore,
} from "./section-header-mutations";

const sectionHeaderStorage = storage.defineItem<SectionHeaderStore>(
  `local:${SECTION_HEADER_STORAGE_KEY}`,
  {
    fallback: EMPTY_SECTION_HEADER_STORE,
  },
);

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
  // Мутации идут через authoritative background-координатор, чтобы параллельные
  // content/sidepanel контексты не теряли чужие обновления.
  await sendSectionHeaderSave({
    key,
    headers: normalizedHeaders,
    url: view.location.href,
  });
}

export async function getSectionPropertyHeaders(
  doc: Document = document,
): Promise<string[]> {
  const key = getSectionHeaderKey(doc);
  const store = parseSectionHeaderStore(await sectionHeaderStorage.getValue());
  return store.snapshots.find((snapshot) => snapshot.key === key)?.headers ?? [];
}
