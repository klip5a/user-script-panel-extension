export type ExtensionSettingKey =
  | "sortHighlightEnabled"
  | "filterSortCheckEnabled"
  | "imageInfoHighlightEnabled"
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
  catalogEmptyPropertiesPanelVisible: false,
  hideSocialWidget: false,
  hideBitrixWidgets: false,
  hideAiChat: false,
  hideCallbackButtons: false,
  hideInvolveoWidget: false
};

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
    key: "catalogEmptyPropertiesPanelVisible",
    title: "Панель пустых свойств",
    description: "Показывает справа навигацию по незаполненным характеристикам таблицы."
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
