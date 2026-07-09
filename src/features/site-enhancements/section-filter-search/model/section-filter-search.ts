import { debounce, getDocument } from "../../../../shared";

interface SectionOptionItem {
  NAME: string;
  VALUE: string;
}

class SectionFilterSearch {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private readonly debouncedUpdate: () => void;
  private readonly styleId = "section-filter-search-styles";
  private readonly helperSelector = ".section-filter-search-helper";
  private readonly fieldSelector = '.main-ui-control-field[data-name="SECTION_ID"]';
  private readonly portalSelector = ".section-filter-search-portal";

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

    doc.querySelectorAll<HTMLElement>(this.fieldSelector).forEach((field) => {
      this.mountHelper(field);
    });
  }

  private mountHelper(field: HTMLElement): void {
    if (field.querySelector(this.helperSelector)) {
      return;
    }

    const select = field.querySelector<HTMLElement>('.main-ui-select[data-name="SECTION_ID"]');
    if (!select) return;

    const items = this.parseItems(select.getAttribute("data-items"));
    if (items.length === 0) return;

    const doc = field.ownerDocument;
    const helper = doc.createElement("div");
    helper.className = "section-filter-search-helper";

    const input = doc.createElement("input");
    input.type = "text";
    input.className = "section-filter-search-input";
    input.placeholder = "Начни вводить раздел";
    input.autocomplete = "off";
    input.spellcheck = false;

    const results = doc.createElement("div");
    results.className = "section-filter-search-results section-filter-search-portal";
    results.hidden = true;

    helper.append(input);
    select.insertAdjacentElement("afterend", helper);
    doc.body.appendChild(results);

    let activeIndex = -1;
    let filteredItems: SectionOptionItem[] = [];
    let isOpen = false;

    const updateResultsPosition = () => {
      if (results.hidden) return;

      const rect = input.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 12;
      const maxHeight = Math.max(180, Math.min(320, spaceBelow));

      Object.assign(results.style, {
        top: `${window.scrollY + rect.bottom + 6}px`,
        left: `${window.scrollX + rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: `${maxHeight}px`,
      });
    };

    const closeResults = () => {
      isOpen = false;
      results.hidden = true;
    };

    const openResults = () => {
      isOpen = true;
      results.hidden = false;
      updateResultsPosition();
    };

    const syncActiveItem = () => {
      results.querySelectorAll<HTMLElement>(".section-filter-search-item").forEach((item) => {
        item.classList.toggle("is-active", Number(item.dataset.index) === activeIndex);
      });
    };

    const renderResults = () => {
      const query = input.value.trim();
      filteredItems = this.filterItems(items, query);

      const visibleItems = filteredItems.slice(0, 30);
      activeIndex = visibleItems.length > 0 ? 0 : -1;
      results.innerHTML = "";

      if (!query) {
        closeResults();
        return;
      }

      if (visibleItems.length === 0) {
        const empty = doc.createElement("div");
        empty.className = "section-filter-search-empty";
        empty.textContent = "Ничего не найдено";
        results.appendChild(empty);
        openResults();
        return;
      }

      visibleItems.forEach((item, index) => {
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "section-filter-search-item";
        button.dataset.value = item.VALUE;
        button.dataset.index = String(index);
        if (index === activeIndex) {
          button.classList.add("is-active");
        }

        const title = doc.createElement("span");
        title.className = "section-filter-search-item-title";
        title.textContent = this.formatDisplayName(item.NAME);

        const path = doc.createElement("span");
        path.className = "section-filter-search-item-path";
        path.textContent = item.NAME.trim();

        button.append(title, path);
        button.addEventListener("mousedown", (event) => {
          event.preventDefault();
        });
        button.addEventListener("click", () => {
          this.applySelection(field, select, item);
          input.value = this.formatDisplayName(item.NAME);
          closeResults();
        });

        results.appendChild(button);
      });

      openResults();
    };

    input.addEventListener("input", renderResults);
    input.addEventListener("focus", renderResults);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeResults();
        return;
      }

      if (results.hidden || filteredItems.length === 0) {
        return;
      }

      const visibleCount = Math.min(filteredItems.length, 30);

      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, visibleCount - 1);
        syncActiveItem();
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        syncActiveItem();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        const item = filteredItems[activeIndex];
        if (!item) return;

        this.applySelection(field, select, item);
        input.value = this.formatDisplayName(item.NAME);
        closeResults();
      }
    });

    const syncPositionIfOpen = () => {
      if (isOpen) {
        updateResultsPosition();
      }
    };

    window.addEventListener("scroll", syncPositionIfOpen, true);
    window.addEventListener("resize", syncPositionIfOpen);

    doc.addEventListener("click", (event) => {
      const target = event.target as Node | null;
      if (!target || helper.contains(target) || results.contains(target)) return;
      closeResults();
    });
  }

  private parseItems(rawItems: string | null): SectionOptionItem[] {
    if (!rawItems) return [];

    try {
      const parsed = JSON.parse(rawItems) as SectionOptionItem[];
      return parsed.filter((item) => typeof item?.NAME === "string" && typeof item?.VALUE === "string");
    } catch {
      return [];
    }
  }

  private filterItems(items: SectionOptionItem[], query: string): SectionOptionItem[] {
    const normalizedQuery = this.normalizeText(query);
    if (!normalizedQuery) return [];

    return items.filter((item) => {
      if (!item.VALUE) return false;

      const normalizedName = this.normalizeText(item.NAME);
      return normalizedName.includes(normalizedQuery) || item.VALUE.toLowerCase().includes(normalizedQuery);
    });
  }

  private applySelection(field: HTMLElement, select: HTMLElement, item: SectionOptionItem): void {
    select.setAttribute("data-value", JSON.stringify(item));

    const selectedText = select.querySelector<HTMLElement>(".main-ui-select-name");
    if (selectedText) {
      selectedText.textContent = item.NAME;
    }

    const nativeSearchInput = select.querySelector<HTMLInputElement>(".main-ui-square-search-item");
    if (nativeSearchInput) {
      nativeSearchInput.value = "";
      nativeSearchInput.dispatchEvent(new Event("input", { bubbles: true }));
      nativeSearchInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const hiddenInput =
      field.querySelector<HTMLInputElement>('input[type="hidden"][name="SECTION_ID"]') ??
      field.querySelector<HTMLInputElement>('input[name="SECTION_ID"]');
    if (hiddenInput) {
      hiddenInput.value = item.VALUE;
      hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
      hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
    }

    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  private normalizeText(value: string): string {
    return value.replace(/\./g, " ").replace(/\s+/g, " ").trim().toLowerCase();
  }

  private formatDisplayName(value: string): string {
    return value.replace(/^\s*(?:\.\s*)+/, "").replace(/\s+/g, " ").trim();
  }

  private injectStyles(): void {
    const doc = getDocument();
    if (!doc || doc.getElementById(this.styleId)) return;

    const style = doc.createElement("style");
    style.id = this.styleId;
    style.textContent = `
      .section-filter-search-helper {
        width: 100%;
        margin-top: 10px;
        position: relative;
      }

      .section-filter-search-input {
        width: 100%;
        min-height: 40px;
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid #cfd8d2;
        border-radius: 6px;
        background: #fff;
        color: #233b35;
        font: 14px/1.4 system-ui, sans-serif;
      }

      .section-filter-search-input:focus {
        outline: 2px solid #8fc7ff;
        outline-offset: 1px;
        border-color: #8fc7ff;
      }

      .section-filter-search-results {
        position: absolute;
        z-index: 999999;
        max-height: 320px;
        overflow-y: auto;
        border: 1px solid #d8e1dc;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 14px 24px rgba(0, 0, 0, 0.12);
      }

      .section-filter-search-item {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        padding: 10px 12px;
        border: none;
        border-bottom: 1px solid #eef2f0;
        background: #fff;
        color: #233b35;
        text-align: left;
        cursor: pointer;
      }

      .section-filter-search-item:last-child {
        border-bottom: none;
      }

      .section-filter-search-item:hover,
      .section-filter-search-item.is-active {
        background: #eaf4ff;
      }

      .section-filter-search-item-title {
        font: 600 13px/1.35 system-ui, sans-serif;
      }

      .section-filter-search-item-path {
        color: #6b7f79;
        font: 12px/1.35 system-ui, sans-serif;
        white-space: normal;
      }

      .section-filter-search-empty {
        padding: 14px 12px;
        color: #70817c;
        font: 13px/1.35 system-ui, sans-serif;
      }
    `;

    doc.head.appendChild(style);
  }

  private cleanup(): void {
    const doc = getDocument();
    if (!doc) return;

    doc.getElementById(this.styleId)?.remove();
    doc.querySelectorAll(this.helperSelector).forEach((helper) => helper.remove());
  }
}

export const sectionFilterSearch = new SectionFilterSearch();
