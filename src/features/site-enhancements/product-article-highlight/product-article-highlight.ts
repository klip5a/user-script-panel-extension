import { debounce, getDocument } from "../../../shared";

class ProductArticleHighlight {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private readonly debouncedUpdate: () => void;

  constructor() {
    this.debouncedUpdate = debounce(this.update.bind(this), 150);
  }

  start(): void {
    if (this.enabled) return;
    this.enabled = true;
    this.injectStyles();
    this.initObserver();
    this.update();
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;
    this.observer?.disconnect();
    this.observer = null;
    this.cleanup();
  }

  private initObserver(): void {
    const doc = getDocument();
    if (!doc?.body) return;

    this.observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.addedNodes.length > 0)) {
        this.debouncedUpdate();
      }
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
  }

  private update(): void {
    if (!this.enabled) return;

    const doc = getDocument();
    if (!doc) return;

    doc.querySelectorAll<HTMLElement>(".top-product-wrapper").forEach((wrapper) => {
      const productCode = wrapper.querySelector<HTMLElement>(".product_code");
      const articleButton = wrapper.querySelector<HTMLElement>(
        ".copy_item_button .copyToClipboadC.detail[data-value]",
      );
      const article = articleButton?.dataset.value?.trim();

      if (!productCode || !article) return;

      const existingBadge = productCode.querySelector<HTMLElement>(
        ".product-article-highlight-badge",
      );
      if (existingBadge) {
        existingBadge.textContent = `${article}`;
        existingBadge.dataset.value = article;
        return;
      }

      const badge = doc.createElement("span");
      badge.className = "product-article-highlight-badge";
      badge.dataset.value = article;
      badge.textContent = `${article}`;
      productCode.appendChild(badge);
    });
  }

  private injectStyles(): void {
    const doc = getDocument();
    if (!doc || doc.getElementById("product-article-highlight-styles")) return;

    const style = doc.createElement("style");
    style.id = "product-article-highlight-styles";
    style.textContent = `
      .product_code .product-article-highlight-badge {
        display: inline-flex !important;
        align-items: center !important;
        margin-left: 8px !important;
        padding: 2px 7px !important;
        border: 1px solid rgba(128, 128, 128, 0.45) !important;
        border-radius: 4px !important;
        background: rgba(128, 128, 128, 0.14) !important;
        color: inherit !important;
        font: 700 11px/1.25 system-ui, sans-serif !important;
        white-space: nowrap !important;
      }
    `;
    doc.head.appendChild(style);
  }

  private cleanup(): void {
    const doc = getDocument();
    if (!doc) return;

    doc.getElementById("product-article-highlight-styles")?.remove();
    doc.querySelectorAll(".product-article-highlight-badge").forEach((badge) => {
      badge.remove();
    });
  }
}

export const productArticleHighlight = new ProductArticleHighlight();
