export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  );
}

type FetchLike = (
  url: string,
  init: { credentials: "same-origin"; signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

type ParseHtmlLike = (html: string) => Document;

export type LinkedRequestHandle = {
  /** Точный URL, по которому был стартован запрос. */
  readonly url: string;
  /** Стабильный монотонный идентификатор запроса в рамках контроллера. */
  readonly id: number;
  /** Поколение жизненного цикла контроллера (инвалидируется abortAll). */
  readonly generation: number;
  readonly signal: AbortSignal;
};

type StoredRequest = {
  controller: AbortController;
  id: number;
};

function defaultParseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/**
 * Владелец AbortController'ов для запросов связанных значений ProductMassEditor.
 *
 * - Новый запрос по тому же searchUrl отменяет предыдущий (superseding);
 * - abortAll() отменяет все активные запросы (close/stop);
 * - response.ok === false отклоняется ДО чтения/парсинга HTML;
 * - AbortError считается ожидаемым и не логируется как сбой.
 */
export class LinkedOptionsController {
  private readonly aborts = new Map<string, StoredRequest>();
  private lifecycleGeneration = 0;
  private requestId = 0;
  private readonly fetchLike: FetchLike;
  private readonly parseHtml: ParseHtmlLike;

  constructor(deps: { fetchLike?: FetchLike; parseHtml?: ParseHtmlLike } = {}) {
    this.fetchLike = deps.fetchLike ?? ((url, init) => fetch(url, init));
    this.parseHtml = deps.parseHtml ?? defaultParseHtml;
  }

  get generation(): number {
    return this.lifecycleGeneration;
  }

  startRequest(searchUrl: string): LinkedRequestHandle {
    const previous = this.aborts.get(searchUrl);
    previous?.controller.abort();

    const controller = new AbortController();
    const id = ++this.requestId;
    this.aborts.set(searchUrl, { controller, id });
    return { url: searchUrl, id, generation: this.lifecycleGeneration, signal: controller.signal };
  }

  finishRequest(handle: LinkedRequestHandle): void {
    if (handle.generation !== this.lifecycleGeneration) return;
    // Удаляем только если владелец карты всё ещё ровно этот запрос:
    // устаревший finally не может снять более свежий запрос по тому же URL.
    const current = this.aborts.get(handle.url);
    if (current?.id !== handle.id) return;
    if (!current.controller.signal.aborted) {
      this.aborts.delete(handle.url);
    }
  }

  abortAll(): void {
    this.lifecycleGeneration += 1;
    this.aborts.forEach(({ controller }) => controller.abort());
    this.aborts.clear();
  }

  isCurrent(handle: LinkedRequestHandle): boolean {
    // Проверка жизненного цикла (abortAll) плюс точное совпадение URL и идентификатора.
    if (handle.generation !== this.lifecycleGeneration) return false;
    const current = this.aborts.get(handle.url);
    return current?.id === handle.id;
  }

  async fetchHtml(url: string, signal: AbortSignal): Promise<Document> {
    const response = await this.fetchLike(url, {
      credentials: "same-origin",
      signal,
    });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const html = await response.text();
    return this.parseHtml(html);
  }
}
