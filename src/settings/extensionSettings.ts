export type ExtensionSettingKey =
  | "sortHighlightEnabled"
  | "filterSortCheckEnabled"
  | "imageInfoHighlightEnabled"
  | "hideSocialWidget"
  | "hideBitrixWidgets"
  | "hideCallbackButtons"
  | "hideInvolveoWidget";

export type ExtensionSettings = {
  sortHighlightEnabled: boolean;
  filterSortCheckEnabled: boolean;
  imageInfoHighlightEnabled: boolean;
  hideSocialWidget: boolean;
  hideBitrixWidgets: boolean;
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
  hideSocialWidget: false,
  hideBitrixWidgets: false,
  hideCallbackButtons: false,
  hideInvolveoWidget: false
};

export const ENHANCEMENT_SETTINGS: SettingItem[] = [
  {
    key: "sortHighlightEnabled",
    title: "Подсветка seo_sort",
    description: "Показывает seo_sort, дубли и подозрительно большие значения."
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
