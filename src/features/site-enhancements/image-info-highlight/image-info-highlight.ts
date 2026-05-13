import {
  cancelIdleTask,
  debounce,
  getDocument,
  type IdleDeadlineLike,
  scheduleIdleTask,
} from "../../../shared";

type ImageInfo = {
  width: number;
  height: number;
  sizeText: string | null;
};

type ImageDimensions = {
  width: number;
  height: number;
};

class ImageInfoHighlight {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private scheduledScanId: number | null = null;
  private scheduledBatchId: number | null = null;
  private pendingImages: HTMLImageElement[] = [];
  // Кэшируем вес по URL, чтобы повторные наведения на одинаковые картинки не делали новые HEAD-запросы.
  private readonly sizeCache = new Map<string, string | null>();
  // Кэшируем реальные размеры оригиналов; null означает, что размер уже пробовали получить, но не смогли.
  private readonly dimensionsCache = new Map<string, ImageDimensions | null>();
  // DOM в каталоге часто дорисовывается лениво, поэтому сканирование надо сглаживать.
  private readonly debouncedProcessImages: () => void;
  private readonly IMAGE_BATCH_SIZE = 20;

  // Целевые изображения: разделы каталога, карточки и галерея товара.
  private readonly IMAGE_SELECTOR = [
    ".table-view__item.item img",
    ".catalog_block img",
    ".catalog-list img",
    ".item-wrapper img",
    ".detail-gallery-big-slider-main img",
    ".detail-gallery-big__picture",
    ".tabDetailImg img",
    ".section_img img",
    ".section_item td.image img",
    ".section_item .image img",
  ].join(",");

  constructor() {
    this.debouncedProcessImages = debounce(this.scheduleProcessImages.bind(this), 350);
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    // Стили добавляются один раз на документ, а бейджи уже создаются рядом с найденными картинками.
    this.injectStyles();
    this.initObserver();
    this.scheduleProcessImages();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    // При выключении настройки возвращаем страницу в исходное состояние.
    this.observer?.disconnect();
    this.cancelScheduledWork();
    this.pendingImages = [];
    this.cleanup();
  }

  private initObserver(): void {
    const doc = getDocument();
    if (!doc?.body) return;

    // Отслеживаем новые карточки/слайды после ajax, lazyload и перестроения каталога.
    this.observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
        this.debouncedProcessImages();
      }
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
  }

  private processImages(): void {
    if (!this.enabled) return;

    const doc = getDocument();
    if (!doc) return;

    // Быстро собираем кандидатов, а DOM-изменения выполняем отдельно небольшими пачками.
    this.pendingImages = Array.from(doc.querySelectorAll<HTMLImageElement>(this.IMAGE_SELECTOR)).filter((image) => {
      // Не обрабатываем картинку повторно, если ее родитель уже получил wrapper-класс.
      if (image.closest(".image-info-highlight-wrap")) return false;
      return this.shouldEnhanceImage(image);
    });

    this.scheduleProcessBatch();
  }

  private scheduleProcessImages(): void {
    if (!this.enabled || this.scheduledScanId !== null) return;

    // Стартовое сканирование переносим в idle, чтобы не конкурировать с загрузкой и первичной отрисовкой.
    this.scheduledScanId = this.runWhenIdle(() => {
      this.scheduledScanId = null;
      this.processImages();
    });
  }

  private scheduleProcessBatch(): void {
    if (!this.enabled || this.scheduledBatchId !== null || this.pendingImages.length === 0) return;

    this.scheduledBatchId = this.runWhenIdle((deadline) => {
      this.scheduledBatchId = null;
      this.processImageBatch(deadline);
    });
  }

  private processImageBatch(deadline: IdleDeadlineLike): void {
    if (!this.enabled) return;

    let processedCount = 0;

    while (
      this.pendingImages.length > 0 &&
      processedCount < this.IMAGE_BATCH_SIZE &&
      (deadline.didTimeout || deadline.timeRemaining() > 4)
    ) {
      const image = this.pendingImages.shift();
      if (!image) continue;
      if (image.closest(".image-info-highlight-wrap")) continue;
      if (!this.shouldEnhanceImage(image)) continue;
      this.enhanceImage(image);
      processedCount += 1;
    }

    this.scheduleProcessBatch();
  }

  private runWhenIdle(callback: (deadline: IdleDeadlineLike) => void): number {
    return scheduleIdleTask(callback);
  }

  private cancelScheduledWork(): void {
    if (this.scheduledScanId !== null) {
      cancelIdleTask(this.scheduledScanId);
      this.scheduledScanId = null;
    }

    if (this.scheduledBatchId !== null) {
      cancelIdleTask(this.scheduledBatchId);
      this.scheduledBatchId = null;
    }
  }

  private shouldEnhanceImage(image: HTMLImageElement): boolean {
    // Стикеры и мелкие декоративные изображения не относятся к товарным фото.
    if (image.closest(".detail-stickers-wrap")) return false;
    if (image.width < 40 && image.height < 40) return false;
    // Бейдж позиционируется относительно родителя картинки, поэтому родитель обязателен.
    if (!image.parentElement) return false;

    // Без URL оригинала фича не сможет показать полезные данные.
    return Boolean(this.getOriginalImageUrl(image));
  }

  private enhanceImage(image: HTMLImageElement): void {
    const doc = getDocument();
    const container = image.parentElement;
    if (!doc || !container) return;

    // Не оборачиваем img новым DOM-узлом, чтобы не ломать Swiper/Fancybox и сетку карточек.
    container.classList.add("image-info-highlight-wrap");

    // Бейдж вставляется рядом с картинкой внутри текущего контейнера.
    const badge = doc.createElement("span");
    badge.className = "image-info-highlight-badge";
    badge.textContent = this.formatBadgeText(this.getImageInfo(image));
    image.insertAdjacentElement("afterend", badge);

    const syncBadge = () => {
      // syncBadge переиспользуется после lazyload img и после загрузки данных оригинала.
      badge.textContent = this.formatBadgeText(this.getImageInfo(image));
      badge.title = this.formatTooltipText(image, this.getImageInfo(image));
    };

    // После lazyload src/currentSrc могут поменяться, поэтому обновляем подпись.
    image.addEventListener("load", syncBadge, { passive: true });
    container.addEventListener("mouseenter", () => {
      // Вес и неизвестные размеры догружаются только по наведению, чтобы не создавать лишний трафик.
      void this.loadOriginalImageInfo(image).then(syncBadge);
    });

    syncBadge();
  }

  private getImageInfo(image: HTMLImageElement): ImageInfo {
    const url = this.getOriginalImageUrl(image);
    // Приоритет: кэш после реальной загрузки, затем размер из Bitrix URL, затем неизвестное состояние.
    const cachedDimensions = url ? this.dimensionsCache.get(url) : null;
    const parsedDimensions = url ? this.parseDimensionsFromUrl(url) : null;
    const dimensions = cachedDimensions ?? parsedDimensions;

    return {
      width: dimensions?.width ?? 0,
      height: dimensions?.height ?? 0,
      sizeText: url ? this.sizeCache.get(url) ?? null : null,
    };
  }

  private formatBadgeText(info: ImageInfo): string {
    // В компактном состоянии показываем минимум: размер оригинала, затем вес после hover.
    const dimensionsText = info.width && info.height ? `${info.width}x${info.height}` : "full ...";
    return info.sizeText ? `${dimensionsText} / ${info.sizeText}` : dimensionsText;
  }

  private formatTooltipText(image: HTMLImageElement, info: ImageInfo): string {
    // Tooltip хранит и отображаемый размер, и данные полного файла для быстрой сверки.
    const parts = [
      `Rendered: ${image.width}x${image.height}`,
      `Full: ${info.width && info.height ? `${info.width}x${info.height}` : "hover to load"}`,
    ];

    if (info.sizeText) {
      parts.push(`Weight: ${info.sizeText}`);
    } else {
      parts.push("Weight: hover to load");
    }

    return parts.join("\n");
  }

  private getOriginalImageUrl(image: HTMLImageElement): string | null {
    // В Fancybox и галереях товара ссылка вокруг превью обычно ведет на полный файл.
    const imageLink = image.closest<HTMLAnchorElement>("a[href]");
    const href = imageLink?.getAttribute("href");

    if (href && this.isImageAssetUrl(href)) {
      return this.normalizeUrl(href);
    }

    // Для карточек без ссылки на полный файл сначала берем не-webp источник из data-атрибутов.
    const candidates = [
      image.dataset.webpDataSrc,
      image.getAttribute("data-webp-data-src"),
      image.dataset.webpSrc,
      image.getAttribute("data-webp-src"),
      image.dataset.src,
      image.getAttribute("data-src"),
      image.currentSrc,
      image.src,
    ];

    const src = candidates.find((candidate) => candidate && this.isImageAssetUrl(candidate));

    if (!src) return null;

    // Если это Bitrix resize_cache, пробуем восстановить путь к исходному /upload/... файлу.
    return this.getUploadOriginalUrl(src) ?? this.normalizeUrl(src);
  }

  private normalizeUrl(url: string): string {
    // Приводим относительные /upload/... пути к абсолютным URL для fetch/Image.
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  }

  private isImageAssetUrl(url: string): boolean {
    // Отсекаем ссылки на страницы каталога, PDF и прочие не-картинки.
    try {
      const parsed = new URL(url, location.href);
      return /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(parsed.pathname + parsed.search);
    } catch {
      return /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(url);
    }
  }

  private parseDimensionsFromUrl(url: string): ImageDimensions | null {
    // В Bitrix resize_cache размер часто зашит в сегмент пути: /1000_500_hash/file.jpg.
    const match = url.match(/\/(\d{2,5})_(\d{2,5})(?:_[^/]*)?\//);
    if (!match) return null;

    return {
      width: Number(match[1]),
      height: Number(match[2]),
    };
  }

  private getUploadOriginalUrl(url: string): string | null {
    // Преобразуем Bitrix resize/webp URL обратно в путь к оригинальному upload-файлу.
    const normalizedUrl = this.normalizeUrl(url);
    const urlWithoutWebpWrapper = normalizedUrl.replace(
      /\/upload\/delight\.webpconverter\/upload\//,
      "/upload/",
    );
    const withoutQuery = urlWithoutWebpWrapper.split("?")[0].replace(/\.webp$/i, "");
    const match = withoutQuery.match(
      /^(.*\/upload)\/resize_cache\/(iblock|uf)\/([^/]+)\/[^/]+\/([^/]+)$/i,
    );

    if (!match) return null;

    return `${match[1]}/${match[2]}/${match[3]}/${match[4]}`;
  }

  private async loadOriginalImageInfo(image: HTMLImageElement): Promise<void> {
    const url = this.getOriginalImageUrl(image);
    if (!url) return;

    // Размер и вес независимы, поэтому загружаем их параллельно.
    await Promise.all([this.loadImageDimensions(url), this.loadImageSize(url)]);
  }

  private async loadImageDimensions(url: string): Promise<void> {
    // Если URL уже проверен, не повторяем даже неудачную попытку.
    if (this.dimensionsCache.has(url)) return;

    const parsedDimensions = this.parseDimensionsFromUrl(url);
    if (parsedDimensions) {
      // Для resize_cache не нужно грузить файл: размер уже есть в пути.
      this.dimensionsCache.set(url, parsedDimensions);
      return;
    }

    // Полное изображение грузим только при наведении, если размер нельзя прочитать из URL.
    await new Promise<void>((resolve) => {
      const probe = new Image();
      probe.onload = () => {
        this.dimensionsCache.set(url, {
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        });
        resolve();
      };
      probe.onerror = () => {
        this.dimensionsCache.set(url, null);
        resolve();
      };
      probe.src = url;
    });
  }

  private async loadImageSize(url: string): Promise<void> {
    // null в кэше используется как маркер "запрос уже был, но вес недоступен".
    if (this.sizeCache.has(url)) return;

    this.sizeCache.set(url, null);

    try {
      // HEAD получает вес файла без скачивания тела картинки, если сервер это поддерживает.
      const response = await fetch(url, { method: "HEAD", cache: "force-cache" });
      const length = response.headers.get("content-length");
      this.sizeCache.set(url, length ? this.formatBytes(Number(length)) : null);
    } catch {
      this.sizeCache.set(url, null);
    }
  }

  private formatBytes(bytes: number): string | null {
    // Формат делаем коротким, потому что бейдж находится поверх картинки.
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes < 1024) return `${bytes} B`;

    const kilobytes = bytes / 1024;
    if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 100 ? 0 : 1)} KB`;

    const megabytes = kilobytes / 1024;
    return `${megabytes.toFixed(megabytes >= 10 ? 1 : 2)} MB`;
  }

  private injectStyles(): void {
    const doc = getDocument();
    if (!doc || doc.getElementById("image-info-highlight-styles")) return;

    // outline и inset box-shadow не меняют размеры блоков и не сдвигают сетку сайта.
    const style = doc.createElement("style");
    style.id = "image-info-highlight-styles";
    style.textContent = `
      .image-info-highlight-wrap {
        position: relative !important;
        outline: 2px solid rgba(5, 150, 105, 0.55) !important;
        outline-offset: -2px !important;
        box-shadow: inset 0 0 0 1px rgba(5, 150, 105, 0.55) !important;
      }
      .image-info-highlight-badge {
        position: absolute !important;
        top: 4px !important;
        right: 4px !important;
        z-index: 30 !important;
        max-width: calc(100% - 8px) !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        box-sizing: border-box !important;
        padding: 3px 6px !important;
        border-radius: 4px !important;
        border: 1px solid rgba(110, 231, 183, 0.9) !important;
        background: rgba(6, 78, 59, 0.9) !important;
        color: #ecfdf5 !important;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18) !important;
        font: 700 10px/1.15 system-ui, sans-serif !important;
        white-space: nowrap !important;
        pointer-events: none !important;
      }
      .image-info-highlight-wrap:hover {
        outline-color: rgba(16, 185, 129, 0.95) !important;
      }
      .image-info-highlight-wrap:hover .image-info-highlight-badge {
        max-width: none !important;
        background: rgba(4, 120, 87, 0.96) !important;
      }
    `;

    doc.head.appendChild(style);
  }

  private cleanup(): void {
    const doc = getDocument();
    if (!doc) return;

    doc.getElementById("image-info-highlight-styles")?.remove();

    // Убираем только свои классы и бейджи, не трогая исходную DOM-структуру сайта.
    doc.querySelectorAll<HTMLElement>(".image-info-highlight-wrap").forEach((wrapper) => {
      wrapper.classList.remove("image-info-highlight-wrap");
    });

    doc.querySelectorAll<HTMLElement>(".image-info-highlight-badge").forEach((badge) => {
      badge.remove();
    });
  }
}

export const imageInfoHighlight = new ImageInfoHighlight();
