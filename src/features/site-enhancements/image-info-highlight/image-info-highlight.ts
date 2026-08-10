import {
  cancelIdleTask,
  getDocument,
  type IdleDeadlineLike,
  scheduleIdleTask,
} from "../../../shared";

type ImageLoadState = "idle" | "loaded" | "error";

type ImageAssetInfo = {
  width: number;
  height: number;
  sizeText: string | null;
  state: ImageLoadState;
};

type ImageDimensions = {
  width: number;
  height: number;
};

type LoadedImageInfo = ImageDimensions & {
  sizeText: string;
};

type ImageInfo = {
  full: ImageAssetInfo | null;
  site: ImageAssetInfo | null;
  sameAsset: boolean;
};

class ImageInfoHighlight {
  private enabled = false;
  private mutationObserver: MutationObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  // Кэшируем метаданные по точному URL; null означает, что файл уже пробовали получить, но не смогли.
  private readonly imageInfoCache = new Map<string, LoadedImageInfo | null>();
  // Один URL может встретиться в нескольких карточках, поэтому параллельные запросы объединяем.
  private readonly pendingInfoRequests = new Map<string, Promise<void>>();
  // Динамические галереи могут менять URL уже обработанного img без замены самого элемента.
  private readonly refreshCallbacks = new WeakMap<HTMLImageElement, () => void>();

  private pendingImages: HTMLImageElement[] = [];
  private scheduledBatchId: number | null = null;
  private readonly IMAGE_BATCH_SIZE = 20;

  private readonly FULL_IMAGE_ATTRIBUTES = [
    "data-full",
    "data-full-src",
    "data-full-image",
    "data-big",
    "data-big-src",
    "data-src-big",
    "data-image-big",
    "data-large",
    "data-large-src",
    "data-zoom",
    "data-zoom-src",
    "data-zoom-image",
    "data-fancybox-href",
  ] as const;

  private readonly FULL_IMAGE_ATTRIBUTE_SELECTOR = this.FULL_IMAGE_ATTRIBUTES
    .map((attribute) => `[${attribute}]`)
    .join(",");

  // Целевые изображения: разделы каталога, карточки и галерея товара.
  private readonly IMAGE_SELECTOR = [
    ".table-view__item.item img",
    ".catalog_block img",
    ".catalog-list img",
    ".item-wrapper img",
    ".detail-gallery-big-slider-main img",
    ".detail-gallery-big__picture",
    ".fastview-product__image .product-detail-gallery__picture",
    ".tabDetailImg img",
    ".section_img img",
    ".section_item td.image img",
    ".section_item .image img",
  ].join(",");

  constructor() {}

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    // Стили добавляются один раз на документ, а бейджи уже создаются рядом с найденными картинками.
    this.injectStyles();
    this.initObserver();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    // При выключении настройки возвращаем страницу в исходное состояние.
    this.mutationObserver?.disconnect();
    this.intersectionObserver?.disconnect();
    
    if (this.scheduledBatchId !== null) {
      cancelIdleTask(this.scheduledBatchId);
      this.scheduledBatchId = null;
    }
    this.pendingImages = [];
    
    this.cleanup();
  }

  private initObserver(): void {
    const doc = getDocument();
    if (!doc?.body) return;

    // Инициализируем IntersectionObserver для отложенной загрузки и подсветки
    this.intersectionObserver = new IntersectionObserver((entries) => {
      let hasNew = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const image = entry.target as HTMLImageElement;
          
          if (!image.closest(".image-info-highlight-wrap") && this.shouldEnhanceImage(image)) {
            this.intersectionObserver?.unobserve(image); // обрабатываем один раз при успешном захвате
            this.pendingImages.push(image);
            hasNew = true;
          }
        }
      }
      if (hasNew) {
        this.scheduleProcessBatch();
      }
    }, {
      rootMargin: "200px", // начинаем обработку чуть заранее до появления на экране
    });

    // Отслеживаем новые карточки/слайды после ajax, lazyload и перестроения каталога.
    this.mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              // Проверяем сам элемент, если это img
              if (element.matches?.(this.IMAGE_SELECTOR)) {
                 this.intersectionObserver?.observe(element);
              }
              // Проверяем его потомков
              if (element.querySelectorAll) {
                const imgs = element.querySelectorAll<HTMLImageElement>(this.IMAGE_SELECTOR);
                for (const img of imgs) {
                  this.intersectionObserver?.observe(img);
                }
              }
            }
          }
        } else if (mutation.type === "attributes") {
          const target = mutation.target as HTMLElement;
          if (target.tagName === "IMG" && target.matches?.(this.IMAGE_SELECTOR)) {
            const image = target as HTMLImageElement;
            const refresh = this.refreshCallbacks.get(image);
            if (refresh) {
              refresh();
            } else {
              this.intersectionObserver?.observe(image);
            }
          } else if (
            target.tagName === "A" ||
            target.matches?.(this.FULL_IMAGE_ATTRIBUTE_SELECTOR)
          ) {
            // Карусель может заменить href/data-full у существующего слайда.
            const images = target.querySelectorAll<HTMLImageElement>(this.IMAGE_SELECTOR);
            for (const image of images) {
              const refresh = this.refreshCallbacks.get(image);
              if (refresh) refresh();
              else this.intersectionObserver?.observe(image);
            }
          }
        }
      }
    });
    this.mutationObserver.observe(doc.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: [
        "src",
        "srcset",
        "href",
        "data-src",
        "data-webp-src",
        "data-webp-data-src",
        ...this.FULL_IMAGE_ATTRIBUTES,
      ]
    });

    // Первоначальный поиск картинок
    const images = doc.querySelectorAll<HTMLImageElement>(this.IMAGE_SELECTOR);
    for (const img of images) {
      this.intersectionObserver.observe(img);
    }
  }

  private scheduleProcessBatch(): void {
    if (!this.enabled || this.scheduledBatchId !== null || this.pendingImages.length === 0) return;

    this.scheduledBatchId = scheduleIdleTask((deadline) => {
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

  private shouldEnhanceImage(image: HTMLImageElement): boolean {
    // Стикеры и мелкие декоративные изображения не относятся к товарным фото.
    if (image.closest(".detail-stickers-wrap")) return false;
    // Бейдж позиционируется относительно родителя картинки, поэтому родитель обязателен.
    if (!image.parentElement) return false;

    // Достаточно хотя бы одного файла: отсутствие Full не должно скрывать параметры Site.
    return Boolean(this.getFullImageUrl(image) || this.getSiteImageUrl(image));
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
    image.insertAdjacentElement("afterend", badge);

    let showDetails = false;

    const syncBadge = () => {
      // syncBadge переиспользуется после lazyload и после загрузки метаданных Full/Site.
      const info = this.getImageInfo(image);
      badge.textContent = this.formatBadgeText(image, info, showDetails);
      badge.title = this.formatBadgeText(image, info, true);
    };

    const refreshInfo = () => {
      syncBadge();
      void Promise.all([
        this.loadImageInfo(this.getFullImageUrl(image)),
        this.loadImageInfo(this.getSiteImageUrl(image)),
      ]).then(syncBadge);
    };

    this.refreshCallbacks.set(image, refreshInfo);

    // После lazyload src/currentSrc могут поменяться, поэтому обновляем подпись.
    image.addEventListener("load", refreshInfo, { passive: true });
    container.addEventListener("mouseenter", () => {
      showDetails = true;
      refreshInfo();
    });
    container.addEventListener("mouseleave", () => {
      showDetails = false;
      syncBadge();
    });

    // Оба точных размера нужны до наведения; Site обычно уже доступен в HTTP-кэше страницы.
    refreshInfo();
  }

  private getImageInfo(image: HTMLImageElement): ImageInfo {
    const fullUrl = this.getFullImageUrl(image);
    const siteUrl = this.getSiteImageUrl(image);

    return {
      full: this.getCachedImageInfo(fullUrl),
      site: this.getCachedImageInfo(siteUrl, {
        width: image.naturalWidth,
        height: image.naturalHeight,
      }),
      sameAsset: Boolean(fullUrl && siteUrl && fullUrl === siteUrl),
    };
  }

  private getCachedImageInfo(
    url: string | null,
    fallbackDimensions: ImageDimensions = { width: 0, height: 0 },
  ): ImageAssetInfo | null {
    if (!url) return null;

    if (!this.imageInfoCache.has(url)) {
      return { ...fallbackDimensions, sizeText: null, state: "idle" };
    }

    const cachedInfo = this.imageInfoCache.get(url);
    if (!cachedInfo) {
      return { ...fallbackDimensions, sizeText: null, state: "error" };
    }

    return { ...cachedInfo, state: "loaded" };
  }

  private formatBadgeText(image: HTMLImageElement, info: ImageInfo, showDetails: boolean): string {
    const lines: string[] = [];

    if (info.full && info.site && info.sameAsset) {
      lines.push(this.formatAssetLine("Full/Site", info.site, showDetails));
    } else {
      if (info.full) lines.push(this.formatAssetLine("Full", info.full, showDetails));
      if (info.site) lines.push(this.formatAssetLine("Site", info.site, showDetails));
    }

    if (lines.length === 0) lines.push("Image: unavailable");

    if (showDetails) {
      lines.push(`Rendered: ${image.width}×${image.height}`);
    }

    return lines.join("\n");
  }

  private formatAssetLine(label: string, info: ImageAssetInfo, showWeight: boolean): string {
    const dimensionsText = info.width && info.height
      ? `${info.width}×${info.height}`
      : info.state === "error"
        ? "unavailable"
        : "...";

    if (!showWeight) return `${label}: ${dimensionsText}`;

    const weightText = info.sizeText ?? (info.state === "error" ? "unavailable" : "...");
    return `${label}: ${dimensionsText} / ${weightText}`;
  }

  private getFullImageUrl(image: HTMLImageElement): string | null {
    // В Fancybox и галереях точный href ведёт к файлу, который откроется в полном просмотре.
    const imageLink = image.closest<HTMLAnchorElement>("a[href]");
    const href = imageLink?.getAttribute("href");

    if (href && this.isImageAssetUrl(href)) {
      return this.normalizeUrl(href);
    }

    // Другие галереи могут хранить полноразмерный файл в явно названном data-атрибуте.
    const attributeOwner = image.closest<HTMLElement>(this.FULL_IMAGE_ATTRIBUTE_SELECTOR);
    const candidateOwners = [image, imageLink, attributeOwner].filter(
      (owner, index, owners): owner is HTMLElement => Boolean(owner) && owners.indexOf(owner) === index,
    );

    for (const owner of candidateOwners) {
      for (const attribute of this.FULL_IMAGE_ATTRIBUTES) {
        const candidate = owner.getAttribute(attribute);
        if (candidate && this.isImageAssetUrl(candidate)) {
          return this.normalizeUrl(candidate);
        }
      }
    }

    return null;
  }

  private normalizeUrl(url: string): string {
    // Приводим относительные /upload/... пути к абсолютным URL для fetch/Image.
    try {
      return new URL(url, location.href).href;
    } catch {
      return url;
    }
  }

  private getSiteImageUrl(image: HTMLImageElement): string | null {
    // currentSrc учитывает выбор браузера из picture/srcset и фактически загруженный WebP/resize.
    const src = image.currentSrc || image.src;
    if (!src || !this.isImageAssetUrl(src)) return null;

    return this.normalizeUrl(src);
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

  private async loadImageInfo(url: string | null): Promise<void> {
    if (!url) return;

    if (this.imageInfoCache.has(url)) return;

    const pendingRequest = this.pendingInfoRequests.get(url);
    if (pendingRequest) {
      await pendingRequest;
      return;
    }

    const request = this.fetchImageInfo(url)
      .then((info) => {
        this.imageInfoCache.set(url, info);
      })
      .catch(() => {
        this.imageInfoCache.set(url, null);
      })
      .finally(() => {
        this.pendingInfoRequests.delete(url);
      });

    this.pendingInfoRequests.set(url, request);
    await request;
  }

  private async fetchImageInfo(url: string): Promise<LoadedImageInfo> {
    // Один GET даёт фактический вес файла и Blob для чтения его естественных размеров.
    const response = await fetch(url, { method: "GET", cache: "force-cache" });
    if (!response.ok) {
      throw new Error(`Image request failed with status ${response.status}`);
    }

    const blob = await response.blob();
    const sizeText = this.formatBytes(blob.size);
    if (!sizeText) {
      throw new Error("Image is empty");
    }

    const dimensions = await this.decodeImageDimensions(blob);
    return { ...dimensions, sizeText };
  }

  private async decodeImageDimensions(blob: Blob): Promise<ImageDimensions> {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(blob);

      try {
        if (!bitmap.width || !bitmap.height) {
          throw new Error("Decoded image has no dimensions");
        }

        return { width: bitmap.width, height: bitmap.height };
      } finally {
        bitmap.close();
      }
    }

    return await new Promise<ImageDimensions>((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const probe = new Image();
      const cleanup = () => URL.revokeObjectURL(objectUrl);

      probe.onload = () => {
        const dimensions = {
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        };
        cleanup();

        if (!dimensions.width || !dimensions.height) {
          reject(new Error("Decoded image has no dimensions"));
          return;
        }

        resolve(dimensions);
      };
      probe.onerror = () => {
        cleanup();
        reject(new Error("Image could not be decoded"));
      };
      probe.src = objectUrl;
    });
  }

  private formatBytes(bytes: number): string | null {
    // Формат делаем коротким, потому что бейдж находится поверх картинки.
    if (!Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes < 1000) return `${bytes} B`;

    // Chrome DevTools использует десятичные kB/MB, поэтому 174905 байт отображаются как 175 KB.
    const kilobytes = bytes / 1000;
    if (kilobytes < 1000) return `${kilobytes.toFixed(kilobytes >= 100 ? 0 : 1)} KB`;

    const megabytes = kilobytes / 1000;
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
      .fastview-product__image .image-info-highlight-wrap {
        display: inline-block !important;
      }
      .tabDetailImg a.image-info-highlight-wrap,
      .tabDetailImg .image-info-highlight-wrap {
        display: inline-block !important;
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
        white-space: pre !important;
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
