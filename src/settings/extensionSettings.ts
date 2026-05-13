export type ExtensionSettingKey =
  | "sortHighlightEnabled"
  | "selectHelperEnabled"
  | "propertySorterEnabled"
  | "filterSortCheckEnabled"
  | "hideSocialWidget"
  | "hideBitrixWidgets"
  | "hideCallbackButtons"
  | "hideInvolveoWidget"
  | "runOnlyInAdmin";

export type ExtensionSettings = {
  sortHighlightEnabled: boolean;
  selectHelperEnabled: boolean;
  propertySorterEnabled: boolean;
  filterSortCheckEnabled: boolean;
  hideSocialWidget: boolean;
  hideBitrixWidgets: boolean;
  hideCallbackButtons: boolean;
  hideInvolveoWidget: boolean;
  runOnlyInAdmin: boolean;
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
  selectHelperEnabled: false,
  propertySorterEnabled: false,
  filterSortCheckEnabled: false,
  hideSocialWidget: false,
  hideBitrixWidgets: false,
  hideCallbackButtons: false,
  hideInvolveoWidget: false,
  runOnlyInAdmin: true
};

export const ENHANCEMENT_SETTINGS: SettingItem[] = [
  {
    key: "sortHighlightEnabled",
    title: "Подсветка seo_sort",
    description: "Показывает seo_sort, дубли и подозрительно большие значения."
  },
  {
    key: "selectHelperEnabled",
    title: "Поиск по select",
    description: "Добавляет поиск рядом с большими списками свойств."
  },
  {
    key: "propertySorterEnabled",
    title: "Сортировка свойств",
    description: "Добавляет автосортировку значений свойства типа список."
  },
  {
    key: "filterSortCheckEnabled",
    title: "Проверка сортировки фильтра",
    description: "Подсвечивает числовые значения фильтра не по порядку."
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

export const RUNTIME_SETTINGS: SettingItem[] = [
  {
    key: "runOnlyInAdmin",
    title: "Только в админке Bitrix",
    description: "Не запускать DOM-улучшения на публичной части сайта."
  }
];
