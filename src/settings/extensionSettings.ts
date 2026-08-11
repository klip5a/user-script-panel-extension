export type ExtensionSettingKey =
  | "sortHighlightEnabled"
  | "filterSortCheckEnabled"
  | "imageInfoHighlightEnabled"
  | "catalogEmptyPropertiesHighlightEnabled"
  | "catalogEmptyPropertiesPanelVisible"
  | "hideSocialWidget"
  | "hideBitrixWidgets"
  | "hideAiChat"
  | "hideCallbackButtons"
  | "hideInvolveoWidget";

export type ExtensionSettings = {
  sortHighlightEnabled: boolean;
  filterSortCheckEnabled: boolean;
  imageInfoHighlightEnabled: boolean;
  catalogEmptyPropertiesHighlightEnabled: boolean;
  catalogEmptyPropertiesPanelVisible: boolean;
  hideSocialWidget: boolean;
  hideBitrixWidgets: boolean;
  hideAiChat: boolean;
  hideCallbackButtons: boolean;
  hideInvolveoWidget: boolean;
};

export type BooleanSettingKey = {
  [K in keyof ExtensionSettings]: ExtensionSettings[K] extends boolean ? K : never;
}[keyof ExtensionSettings];

export type SettingItem = {
  key: BooleanSettingKey;
  title: string;
  description: string;
};

export const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  sortHighlightEnabled: false,
  filterSortCheckEnabled: false,
  imageInfoHighlightEnabled: false,
  catalogEmptyPropertiesHighlightEnabled: false,
  catalogEmptyPropertiesPanelVisible: false,
  hideSocialWidget: false,
  hideBitrixWidgets: false,
  hideAiChat: false,
  hideCallbackButtons: false,
  hideInvolveoWidget: false
};

// Эффективная нормализация прочитанных настроек: повреждённые значения игнорируются,
// а legacy-инвариант panelVisible=true всегда включает подсветку пустых свойств.
export function normalizeExtensionSettings(value: unknown): ExtensionSettings {
  const candidate =
    typeof value === "object" && value !== null
      ? (value as Record<string, unknown>)
      : {};
  const settings: ExtensionSettings = { ...DEFAULT_EXTENSION_SETTINGS };

  (Object.keys(DEFAULT_EXTENSION_SETTINGS) as ExtensionSettingKey[]).forEach((key) => {
    if (typeof candidate[key] === "boolean") {
      settings[key] = candidate[key] as boolean;
    }
  });

  if (settings.catalogEmptyPropertiesPanelVisible) {
    settings.catalogEmptyPropertiesHighlightEnabled = true;
  }

  return settings;
}

// Нормализация записываемого патча: связанные флаги панели/подсветки меняются атомарно
// в одном наборе ключей, а невалидные значения отбрасываются.
export function normalizeSettingsPatch(
  patch: Partial<ExtensionSettings>,
): Partial<ExtensionSettings> {
  const normalized: Partial<ExtensionSettings> = {};

  (Object.keys(patch) as ExtensionSettingKey[]).forEach((key) => {
    if (typeof patch[key] === "boolean") {
      normalized[key] = patch[key];
    }
  });

  if (normalized.catalogEmptyPropertiesPanelVisible === true) {
    normalized.catalogEmptyPropertiesHighlightEnabled = true;
  }
  if (normalized.catalogEmptyPropertiesHighlightEnabled === false) {
    normalized.catalogEmptyPropertiesPanelVisible = false;
  }

  return normalized;
}

export const ENHANCEMENT_SETTINGS: SettingItem[] = [
  {
    key: "sortHighlightEnabled",
    title: "Подсветка seo_sort",
    description: "Показывает seo_sort и выделяет пропуски, дубли, смены диапазона и выбросы."
  },
  {
    key: "filterSortCheckEnabled",
    title: "Проверка сортировки фильтра",
    description: "Подсвечивает числовые значения фильтра не по порядку."
  },
  {
    key: "imageInfoHighlightEnabled",
    title: "Информация о картинках",
    description: "Показывает размер полного изображения в каталоге и карточке товара, вес файла догружает при наведении."
  },
  {
    key: "catalogEmptyPropertiesHighlightEnabled",
    title: "Подсветка пустых свойств",
    description: "Находит и подсвечивает незаполненные характеристики в таблице каталога."
  },
  {
    key: "catalogEmptyPropertiesPanelVisible",
    title: "Мини-панель пустых свойств",
    description: "Показывает навигацию по найденным пропускам и автоматически включает проверку."
  }
];

export const STYLE_SETTINGS: SettingItem[] = [
  {
    key: "hideSocialWidget",
    title: "Скрыть виджет соцсетей",
    description: "Отключает плавающий блок .cback."
  },
  {
    key: "hideBitrixWidgets",
    title: "Скрыть CRM-виджеты",
    description: "Убирает мешающие Bitrix24/CRM кнопки."
  },
  {
    key: "hideAiChat",
    title: "Скрыть ИИ-чат CNC1",
    description: "Убирает кнопку, окно и затемнение ИИ-ассистента CNC1."
  },
  {
    key: "hideCallbackButtons",
    title: "Скрыть кнопки связи",
    description: "Убирает кнопки заказа звонка и вопроса."
  },
  {
    key: "hideInvolveoWidget",
    title: "Скрыть Involveo",
    description: "Отключает involveo-widget на странице."
  }
];
