import {
  type SelectInfo,
  type SelectOption,
  type SelectScanOptions,
  DEFAULT_SELECT_PATTERN,
} from "../../../shared";

/** Расширение HTMLSelectElement для хранения оригинальных опций */
declare global {
  interface HTMLSelectElement {
    _originalOptions?: HTMLOptionElement[];
  }
}

/** Стилизация для инъецированных элементов */
const INJECTED_STYLES_ID = "select-helper-injected-styles";
const INJECTED_STYLES = `
  .select-helper-btn {
    position: absolute;
    right: 24px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    padding: 0;
    border: 1px solid #6b7280;
    border-radius: 4px;
    background: #374151;
    color: #9ca3af;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    transition: all 0.2s;
  }
  .select-helper-btn:hover {
    background: #4b5563;
    color: #fff;
    border-color: #9ca3af;
  }
  .select-helper-btn.loading {
    pointer-events: none;
  }
  .select-helper-btn.loading .select-helper-btn-icon {
    display: none;
  }
  .select-helper-btn .select-helper-spinner {
    display: none;
    width: 12px;
    height: 12px;
    border: 2px solid #9ca3af;
    border-top-color: transparent;
    border-radius: 50%;
    animation: select-helper-spin 0.8s linear infinite;
  }
  .select-helper-btn.loading .select-helper-spinner {
    display: block;
  }
  @keyframes select-helper-spin {
    to { transform: rotate(360deg); }
  }
  .select-helper-popup {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    z-index: 10000;
    max-height: 300px;
    display: flex;
    flex-direction: column;
  }
  .select-helper-popup-input {
    width: 100%;
    padding: 8px 12px;
    background: #f9fafb;
    border: none;
    border-bottom: 1px solid #e5e7eb;
    color: #1f2937;
    font-size: 14px;
    outline: none;
    border-radius: 8px 8px 0 0;
  }
  .select-helper-popup-input:focus {
    background: #ffffff;
  }
  .select-helper-popup-list {
    overflow-y: auto;
    flex: 1;
  }
  .select-helper-popup-item {
    padding: 8px 12px;
    cursor: pointer;
    color: #374151;
    font-size: 13px;
    border-bottom: 1px solid #f3f4f6;
    transition: background 0.15s;
  }
  .select-helper-popup-item:last-child {
    border-bottom: none;
  }
  .select-helper-popup-item:hover {
    background: #f3f4f6;
  }
  .select-helper-popup-item.selected {
    background: #3b82f6;
    color: #fff;
  }
  .select-helper-popup-empty {
    padding: 16px;
    text-align: center;
    color: #9ca3af;
    font-size: 13px;
  }
  .select-helper-wrapper {
    position: relative;
    display: inline-block;
  }
`;

/**
 * Класс для работы с select'ами на странице
 * Сканирование, сортировка, фильтрация опций, инъекция кнопок поиска
 */
export class SelectHelper {
  private readonly defaultMinOptions = 5;
  private injectedButtons: Map<string, HTMLElement> = new Map();
  private activePopup: HTMLElement | null = null;
  private stylesInjected = false;
  private observer: MutationObserver | null = null;
  private scanOptions: SelectScanOptions | undefined;

  /**
   * Сканирует страницу и возвращает список найденных select'ов
   */
  scan(options?: SelectScanOptions): SelectInfo[] {
    const pattern = options?.namePattern ?? DEFAULT_SELECT_PATTERN;
    const minOptions = options?.minOptions ?? this.defaultMinOptions;

    const selects = document.querySelectorAll<HTMLSelectElement>("select");
    const result: SelectInfo[] = [];

    selects.forEach((select) => {
      const name = select.getAttribute("name");
      if (!name) return;

      const match = name.match(pattern);
      if (!match) return;

      // Проверяем минимальное количество опций
      if (select.options.length < minOptions) return;

      const index = parseInt(match[1], 10);

      // Ищем связанный label
      const label = this.findLabel(select);

      result.push({
        id: name, // используем name как уникальный ID
        name,
        index,
        optionsCount: select.options.length,
        label,
      });
    });

    // Сортируем по индексу
    return result.sort((a, b) => a.index - b.index);
  }

  /**
   * Сортирует опции в select по алфавиту (кириллица)
   * Сохраняет первую пустую опцию на месте
   */
  sortSelect(selectElement: HTMLSelectElement): void {
    const options = Array.from(selectElement.options);
    if (options.length === 0) return;

    // Сохраняем первую опцию (обычно пустая "Выберите...")
    const firstOption = options[0];
    const optionsToSort = options.slice(1);

    // Сортировка по тексту с учётом кириллицы
    optionsToSort.sort((a, b) => {
      const textA = (a.textContent || "").trim().toLowerCase();
      const textB = (b.textContent || "").trim().toLowerCase();
      return textA.localeCompare(textB, "ru");
    });

    // Очищаем select
    selectElement.innerHTML = "";

    // Добавляем первую опцию обратно
    selectElement.appendChild(firstOption);

    // Добавляем отсортированные опции
    optionsToSort.forEach((option) => selectElement.appendChild(option));
  }

  /**
   * Получает список опций select'а
   */
  getOptions(selectElement: HTMLSelectElement): SelectOption[] {
    return Array.from(selectElement.options).map((opt) => ({
      value: opt.value,
      text: opt.textContent || "",
    }));
  }

  /**
   * Фильтрует опции по поисковому запросу
   * Возвращает отфильтрованный список (не изменяет DOM)
   */
  filterOptions(selectElement: HTMLSelectElement, query: string): SelectOption[] {
    const normalizedQuery = query.toLowerCase().trim();
    const options = this.getOptions(selectElement);

    if (!normalizedQuery) {
      return options;
    }

    return options.filter((opt) => {
      const text = opt.text.toLowerCase();
      const value = opt.value.toLowerCase();
      return text.includes(normalizedQuery) || value.includes(normalizedQuery);
    });
  }

  /**
   * Выбирает опцию в select по значению
   */
  selectOption(selectElement: HTMLSelectElement, value: string): void {
    selectElement.value = value;

    // Триггерим событие change для совместимости с React
    const event = new Event("change", { bubbles: true });
    selectElement.dispatchEvent(event);
  }

  /**
   * Подсвечивает select на странице (scroll + outline)
   */
  highlightSelect(selectElement: HTMLSelectElement): void {
    // Scroll к элементу
    selectElement.scrollIntoView({ behavior: "smooth", block: "center" });

    // Временная подсветка
    const originalOutline = selectElement.style.outline;
    const originalOutlineOffset = selectElement.style.outlineOffset;

    selectElement.style.outline = "3px solid #4CAF50";
    selectElement.style.outlineOffset = "2px";

    setTimeout(() => {
      selectElement.style.outline = originalOutline;
      selectElement.style.outlineOffset = originalOutlineOffset;
    }, 2000);
  }

  /**
   * Получить элемент select по ID (name атрибут)
   */
  getSelectElement(id: string): HTMLSelectElement | null {
    return document.querySelector(`select[name="${CSS.escape(id)}"]`);
  }

  /**
   * Ищет связанный label для select
   */
  private findLabel(select: HTMLSelectElement): string | undefined {
    // Способ 1: label через for атрибут
    const id = select.id;
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label?.textContent) {
        return label.textContent.trim();
      }
    }

    // Способ 2: label внутри которой находится select
    const parentLabel = select.closest("label");
    if (parentLabel?.textContent) {
      // Убираем текст самого select из label
      const text = parentLabel.textContent.replace(select.textContent || "", "").trim();
      if (text) return text;
    }

    // Способ 3: предыдущий sibling с классом label или похожим
    const prevSibling = select.previousElementSibling;
    if (prevSibling?.classList.contains("label") || prevSibling?.tagName === "LABEL") {
      return prevSibling.textContent?.trim();
    }

    return undefined;
  }

  // ========================================
  // ИНЪЕКЦИЯ КНОПОК ПОИСКА
  // ========================================

  /**
   * Инъецирует стили для кнопок и popup
   */
  private injectStyles(): void {
    if (this.stylesInjected) return;
    if (document.getElementById(INJECTED_STYLES_ID)) return;

    const style = document.createElement("style");
    style.id = INJECTED_STYLES_ID;
    style.textContent = INJECTED_STYLES;
    document.head.appendChild(style);
    this.stylesInjected = true;
  }

  /**
   * Инъецирует кнопки поиска рядом с select'ами
   */
  injectButtons(options?: SelectScanOptions): void {
    this.scanOptions = options;
    this.injectStyles();
    this.removeButtons(); // Сначала убираем старые

    const selects = this.scan(options);

    selects.forEach((info) => {
      this.injectButtonForSelect(info.id);
    });

    // Запускаем наблюдение за новыми select'ами
    this.startObserver();
  }

  /**
   * Инъецирует кнопку поиска для одного select
   */
  private injectButtonForSelect(selectId: string): void {
    // Проверяем, что кнопка ещё не добавлена
    if (this.injectedButtons.has(selectId)) return;

    const select = this.getSelectElement(selectId);
    if (!select) return;

    // Оборачиваем select в wrapper если ещё не обёрнут
    let wrapper = select.parentElement?.closest(".select-helper-wrapper");
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.className = "select-helper-wrapper";
      select.parentNode?.insertBefore(wrapper, select);
      wrapper.appendChild(select);
    }

    // Создаём кнопку поиска
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "select-helper-btn";
    btn.title = "Поиск по опциям";
    btn.dataset.selectId = selectId;

    // Иконка поиска
    const icon = document.createElement("span");
    icon.className = "select-helper-btn-icon";
    icon.textContent = "🔍";
    btn.appendChild(icon);

    // Спиннер загрузки
    const spinner = document.createElement("span");
    spinner.className = "select-helper-spinner";
    btn.appendChild(spinner);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePopup(selectId, btn);
    });

    wrapper.appendChild(btn);
    this.injectedButtons.set(selectId, btn);
  }

  /**
   * Удаляет все инъецированные кнопки
   */
  removeButtons(): void {
    this.closePopup();
    this.stopObserver(); // Останавливаем наблюдение

    this.injectedButtons.forEach((btn) => {
      btn.remove();
    });
    this.injectedButtons.clear();

    // Удаляем wrapper'ы, разворачиваем select'ы
    document.querySelectorAll(".select-helper-wrapper").forEach((wrapper) => {
      const select = wrapper.querySelector("select");
      if (select) {
        wrapper.parentNode?.insertBefore(select, wrapper);
      }
      wrapper.remove();
    });
  }

  /**
   * Запускает MutationObserver для отслеживания новых select'ов
   */
  private startObserver(): void {
    if (this.observer) return; // Уже запущен

    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList") continue;

        for (const node of mutation.addedNodes) {
          // Проверяем, является ли добавленный узел элементом
          if (!(node instanceof HTMLElement)) continue;

          // Ищем все select внутри добавленного элемента
          const selects =
            node.tagName === "SELECT"
              ? [node as HTMLSelectElement]
              : Array.from(node.querySelectorAll<HTMLSelectElement>("select"));

          for (const select of selects) {
            const name = select.getAttribute("name");
            if (!name) continue;

            // Проверяем, соответствует ли select нашим критериям
            const pattern = this.scanOptions?.namePattern ?? DEFAULT_SELECT_PATTERN;
            const minOptions = this.scanOptions?.minOptions ?? this.defaultMinOptions;

            const match = name.match(pattern);
            if (!match) continue;
            if (select.options.length < minOptions) continue;

            // Добавляем кнопку для нового select
            this.injectButtonForSelect(name);
          }
        }
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Останавливает MutationObserver
   */
  private stopObserver(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  /**
   * Переключает видимость popup с поиском
   */
  private togglePopup(selectId: string, btn: HTMLElement): void {
    // Если popup уже открыт для этого select - закрываем
    if (this.activePopup?.dataset.selectId === selectId) {
      this.closePopup();
      return;
    }

    this.closePopup();

    // Показываем loading состояние
    btn.classList.add("loading");

    // Задержка для отрисовки спиннера перед тяжёлыми вычислениями
    setTimeout(() => {
      this.showPopup(selectId, btn);
    }, 50);
  }

  /**
   * Показывает popup с поиском опций
   */
  private showPopup(selectId: string, btn: HTMLElement): void {
    const select = this.getSelectElement(selectId);
    if (!select) {
      btn.classList.remove("loading");
      return;
    }

    const wrapper = btn.parentElement;
    if (!wrapper) {
      btn.classList.remove("loading");
      return;
    }

    // Создаём popup
    const popup = document.createElement("div");
    popup.className = "select-helper-popup";
    popup.dataset.selectId = selectId;

    // Поле поиска
    const input = document.createElement("input");
    input.type = "text";
    input.className = "select-helper-popup-input";
    input.placeholder = "Поиск...";

    // Список опций
    const list = document.createElement("div");
    list.className = "select-helper-popup-list";

    // Рендерим опции
    const renderOptions = (query: string) => {
      const options = this.filterOptions(select, query);
      list.innerHTML = "";

      if (options.length === 0) {
        const empty = document.createElement("div");
        empty.className = "select-helper-popup-empty";
        empty.textContent = "Ничего не найдено";
        list.appendChild(empty);
        return;
      }

      options.forEach((opt) => {
        const item = document.createElement("div");
        item.className = "select-helper-popup-item";
        if (opt.value === select.value) {
          item.classList.add("selected");
        }
        item.textContent = opt.text;
        item.dataset.value = opt.value;

        item.addEventListener("click", () => {
          this.selectOption(select, opt.value);
          this.closePopup();
        });

        list.appendChild(item);
      });
    };

    // Поиск по вводу
    input.addEventListener("input", () => {
      renderOptions(input.value);
    });

    // Закрытие по клику вне popup
    const closeOnOutsideClick = (e: MouseEvent) => {
      if (!popup.contains(e.target as Node) && e.target !== btn) {
        this.closePopup();
      }
    };

    // Закрытие по Escape
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.closePopup();
      }
    };

    popup.appendChild(input);
    popup.appendChild(list);
    wrapper.appendChild(popup);

    // Фокус на input
    requestAnimationFrame(() => input.focus());

    // Рендерим все опции изначально
    renderOptions("");

    this.activePopup = popup;

    // Добавляем слушатели закрытия
    setTimeout(() => {
      document.addEventListener("click", closeOnOutsideClick);
      document.addEventListener("keydown", closeOnEscape);
    }, 10);

    // Сохраняем ссылки для очистки
    popup._closeHandlers = { closeOnOutsideClick, closeOnEscape };
    popup._triggerButton = btn;

    // Убираем loading - popup готов
    btn.classList.remove("loading");
  }

  /**
   * Закрывает активный popup
   */
  closePopup(): void {
    if (!this.activePopup) return;

    // Убираем loading с кнопки
    const btn = this.activePopup._triggerButton;
    if (btn) {
      btn.classList.remove("loading");
    }

    // Удаляем слушатели
    const handlers = this.activePopup._closeHandlers;
    if (handlers) {
      document.removeEventListener("click", handlers.closeOnOutsideClick);
      document.removeEventListener("keydown", handlers.closeOnEscape);
    }

    this.activePopup.remove();
    this.activePopup = null;
  }
}

/** Расширение HTMLElement для хранения обработчиков закрытия */
declare global {
  interface HTMLElement {
    _closeHandlers?: {
      closeOnOutsideClick: (e: MouseEvent) => void;
      closeOnEscape: (e: KeyboardEvent) => void;
    };
    _triggerButton?: HTMLElement;
  }
}

/** Синглтон для использования в приложении */
export const selectHelper = new SelectHelper();
