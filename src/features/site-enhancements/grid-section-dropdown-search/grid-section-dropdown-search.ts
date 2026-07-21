import { debounce, getDocument } from "../../../shared";

type SectionDropdownItem = {
  NAME: string;
  VALUE: string;
};

type MenuItem = {
  element: HTMLElement;
  normalizedName: string;
};

type PopupState = {
  root: HTMLElement;
  control: HTMLElement;
  search: HTMLInputElement;
  searchHost: HTMLElement;
  empty: HTMLElement;
  items: MenuItem[];
  filterFrame: number | null;
};

const CONTROL_SELECTOR = '.main-dropdown.main-grid-panel-control[data-name="section_to_move"][data-items]';
const POPUP_SELECTOR = ".main-dropdown-popup, .menu-popup, .popup-window";
const MENU_ITEM_SELECTOR = [
  ".main-dropdown-item",
  ".menu-popup-item",
  '[role="menuitem"]',
  "[data-value]",
].join(", ");
const SEARCH_HOST_CLASS = "cnc1-grid-section-search";
const HIDDEN_ITEM_CLASS = "cnc1-grid-section-search-hidden";
const STYLE_ID = "cnc1-grid-section-search-styles";

const STYLES = `
  .${SEARCH_HOST_CLASS} {
    position: sticky;
    top: 0;
    z-index: 2;
    box-sizing: border-box;
    width: 100%;
    padding: 10px;
    border-bottom: 1px solid #e5e9ec;
    background: #fff;
  }

  .${SEARCH_HOST_CLASS}__label {
    position: absolute !important;
    width: 1px !important;
    height: 1px !important;
    padding: 0 !important;
    margin: -1px !important;
    overflow: hidden !important;
    clip-path: inset(50%) !important;
    border: 0 !important;
    white-space: nowrap !important;
  }

  .${SEARCH_HOST_CLASS}__input {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-height: 38px;
    padding: 8px 11px;
    border: 1px solid #aeb8c2;
    border-radius: 4px;
    background: #fff;
    color: #333;
    font: 14px/1.4 Arial, sans-serif;
  }

  .${SEARCH_HOST_CLASS}__input:focus-visible {
    outline: 2px solid #2fc6f6;
    outline-offset: 1px;
    border-color: #2fc6f6;
  }

  .${SEARCH_HOST_CLASS}__empty {
    box-sizing: border-box;
    width: 100%;
    padding: 16px 20px;
    color: #7a8490;
    font: 14px/1.4 Arial, sans-serif;
  }

  .${HIDDEN_ITEM_CLASS} {
    display: none !important;
  }
`;

export class GridSectionDropdownSearch {
  private enabled = false;
  private observer: MutationObserver | null = null;
  private activeControl: HTMLElement | null = null;
  private inputSequence = 0;
  private readonly popupStates = new Set<PopupState>();
  private readonly enhanceDebounced = debounce(() => this.enhanceOpenPopup(), 30);

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const control = target.closest<HTMLElement>(CONTROL_SELECTOR);
    if (!control) return;

    this.activeControl = control;
    window.setTimeout(() => this.enhanceOpenPopup(), 0);
  };

  start(): void {
    if (this.enabled) return;
    this.enabled = true;

    const doc = getDocument();
    if (!doc?.body) return;

    this.injectStyles(doc);
    doc.addEventListener("click", this.handleDocumentClick, true);
    this.observer = new MutationObserver((mutations) => {
      if (this.activeControl && mutations.some((mutation) => mutation.addedNodes.length > 0)) {
        this.enhanceDebounced();
      }
    });
    this.observer.observe(doc.body, { childList: true, subtree: true });
  }

  stop(): void {
    if (!this.enabled) return;
    this.enabled = false;

    const doc = getDocument();
    doc?.removeEventListener("click", this.handleDocumentClick, true);
    this.observer?.disconnect();
    this.observer = null;
    this.activeControl = null;

    this.popupStates.forEach((state) => this.destroyPopupState(state));
    this.popupStates.clear();
    doc?.getElementById(STYLE_ID)?.remove();
  }

  private enhanceOpenPopup(): void {
    if (!this.enabled || !this.activeControl?.isConnected) return;

    this.pruneDetachedStates();

    const existingState = Array.from(this.popupStates).find(
      (state) => state.control === this.activeControl && this.isVisible(state.root),
    );
    if (existingState) {
      this.resetAndFocus(existingState);
      return;
    }

    const items = this.parseItems(this.activeControl.getAttribute("data-items"));
    if (items.length === 0) return;

    const popupMatch = this.findMatchingPopup(this.activeControl.ownerDocument, items);
    if (!popupMatch) return;

    const state = this.mountSearch(this.activeControl, popupMatch.root, popupMatch.items);
    if (!state) return;

    this.popupStates.add(state);
    this.resetAndFocus(state);
  }

  private findMatchingPopup(
    doc: Document,
    options: SectionDropdownItem[],
  ): { root: HTMLElement; items: MenuItem[] } | null {
    let bestMatch: { root: HTMLElement; items: MenuItem[] } | null = null;

    doc.querySelectorAll<HTMLElement>(POPUP_SELECTOR).forEach((root) => {
      if (!this.isVisible(root) || root.closest(`.${SEARCH_HOST_CLASS}`)) return;

      const menuItems = this.collectMenuItems(root, options);
      if (menuItems.length === 0) return;

      if (!bestMatch || menuItems.length > bestMatch.items.length) {
        bestMatch = { root, items: menuItems };
      }
    });

    return bestMatch;
  }

  private collectMenuItems(root: HTMLElement, options: SectionDropdownItem[]): MenuItem[] {
    const names = new Set(options.map((item) => this.normalizeText(item.NAME)));
    const values = new Set(options.map((item) => item.VALUE));
    const elements = new Set<HTMLElement>();

    root.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR).forEach((candidate) => {
      const itemElement =
        candidate.closest<HTMLElement>(".main-dropdown-item, .menu-popup-item, [role=\"menuitem\"]") ??
        candidate;
      if (!root.contains(itemElement) || itemElement.closest(`.${SEARCH_HOST_CLASS}`)) return;

      const value = itemElement.dataset.value ?? candidate.dataset.value ?? "";
      const normalizedName = this.normalizeText(itemElement.textContent ?? "");
      if (!values.has(value) && !names.has(normalizedName)) return;

      elements.add(itemElement);
    });

    return Array.from(elements).map((element) => ({
      element,
      normalizedName: this.normalizeText(element.textContent ?? ""),
    }));
  }

  private mountSearch(
    control: HTMLElement,
    root: HTMLElement,
    items: MenuItem[],
  ): PopupState | null {
    const firstItem = items[0]?.element;
    const host = firstItem?.parentElement;
    if (!firstItem || !host) return null;

    const doc = root.ownerDocument;
    const searchHost = doc.createElement("div");
    searchHost.className = SEARCH_HOST_CLASS;

    const label = doc.createElement("label");
    const inputId = `${SEARCH_HOST_CLASS}-${++this.inputSequence}`;
    label.className = `${SEARCH_HOST_CLASS}__label`;
    label.htmlFor = inputId;
    label.textContent = "Поиск раздела";

    const search = doc.createElement("input");
    search.id = inputId;
    search.type = "search";
    search.className = `${SEARCH_HOST_CLASS}__input`;
    search.placeholder = "Поиск раздела";
    search.autocomplete = "off";
    search.spellcheck = false;

    const empty = doc.createElement("div");
    empty.className = `${SEARCH_HOST_CLASS}__empty`;
    empty.textContent = "Ничего не найдено";
    empty.setAttribute("role", "status");
    empty.setAttribute("aria-live", "polite");
    empty.hidden = true;

    searchHost.append(label, search);
    host.insertBefore(searchHost, firstItem);
    host.insertBefore(empty, firstItem);

    const state: PopupState = {
      root,
      control,
      search,
      searchHost,
      empty,
      items,
      filterFrame: null,
    };

    const scheduleFilter = () => {
      if (state.filterFrame !== null) {
        window.cancelAnimationFrame(state.filterFrame);
      }
      state.filterFrame = window.requestAnimationFrame(() => {
        state.filterFrame = null;
        this.filterMenu(state, search.value);
      });
    };

    search.addEventListener("input", scheduleFilter);
    searchHost.addEventListener("mousedown", (event) => event.stopPropagation());
    searchHost.addEventListener("click", (event) => event.stopPropagation());
    search.addEventListener("keydown", (event) => {
      const clearsSearch = event.key === "Escape" && search.value.length > 0;
      if (clearsSearch) {
        event.preventDefault();
        search.value = "";
        this.filterMenu(state, "");
      }
      if (event.key !== "Escape" || clearsSearch) {
        event.stopPropagation();
      }
    });

    return state;
  }

  private filterMenu(state: PopupState, query: string): void {
    const normalizedQuery = this.normalizeText(query);
    let visibleCount = 0;

    state.items.forEach((item) => {
      const matches = !normalizedQuery || item.normalizedName.includes(normalizedQuery);
      item.element.classList.toggle(HIDDEN_ITEM_CLASS, !matches);
      if (matches) visibleCount += 1;
    });

    state.empty.hidden = visibleCount > 0;
  }

  private resetAndFocus(state: PopupState): void {
    state.search.value = "";
    this.filterMenu(state, "");
    window.requestAnimationFrame(() => {
      if (this.isVisible(state.root)) state.search.focus();
    });
  }

  private parseItems(rawItems: string | null): SectionDropdownItem[] {
    if (!rawItems) return [];

    try {
      const parsed = JSON.parse(rawItems) as unknown;
      if (!Array.isArray(parsed)) return [];

      return parsed.filter(
        (item): item is SectionDropdownItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as SectionDropdownItem).NAME === "string" &&
          typeof (item as SectionDropdownItem).VALUE === "string",
      );
    } catch {
      return [];
    }
  }

  private normalizeText(value: string): string {
    return value
      .replace(/^\s*(?:\.\s*)+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLocaleLowerCase("ru-RU");
  }

  private isVisible(element: HTMLElement): boolean {
    const view = element.ownerDocument.defaultView;
    if (!view) return false;

    const style = view.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
  }

  private pruneDetachedStates(): void {
    this.popupStates.forEach((state) => {
      if (state.root.isConnected) return;
      this.destroyPopupState(state);
      this.popupStates.delete(state);
    });
  }

  private destroyPopupState(state: PopupState): void {
    if (state.filterFrame !== null) {
      window.cancelAnimationFrame(state.filterFrame);
    }
    state.items.forEach((item) => item.element.classList.remove(HIDDEN_ITEM_CLASS));
    state.searchHost.remove();
    state.empty.remove();
  }

  private injectStyles(doc: Document): void {
    if (doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = STYLES;
    doc.head.appendChild(style);
  }
}

export const gridSectionDropdownSearch = new GridSectionDropdownSearch();
