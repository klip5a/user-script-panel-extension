import type { FeatureToggleItem } from "../types";
import { useStoredFlag } from "./useStoredFlag";

// Legacy-список фич для старого popup UI. Side panel сейчас использует chrome.storage настройки.
export function useFeaturesList() {
  const [disableSocialWidget, setDisableSocialWidget] = useStoredFlag(
    "userScriptPanel.widgets.social.disabled",
    false,
  );
  const [disableBitrixWidgets, setDisableBitrixWidgets] = useStoredFlag(
    "userScriptPanel.widgets.bitrix.disabled",
    false,
  );
  const [disableCallbackButtons, setDisableCallbackButtons] = useStoredFlag(
    "userScriptPanel.widgets.callback.disabled",
    false,
  );
  const [sortHighlightEnable, setSortHighlightEnable] = useStoredFlag(
    "userScriptPanel.seo.enabled",
    false,
  );
  const [selectHelperEnable, setSelectHelperEnable] = useStoredFlag(
    "userScriptPanel.selectHelper.enabled",
    false,
  );
  const [disableInvolveoWidget, setDisableInvolveoWidget] = useStoredFlag(
    "userScriptPanel.widgets.involveo.disabled",
    false,
  );
  const [propertySorterEnable, setPropertySorterEnable] = useStoredFlag(
    "userScriptPanel.propertySorter.enabled",
    false,
  );
  const [filterSortCheckEnable, setFilterSortCheckEnable] = useStoredFlag(
    "userScriptPanel.filterSortCheck.enabled",
    false,
  );

  return {
    sortHighlightEnable,
    selectHelperEnable,
    propertySorterEnable,
    filterSortCheckEnable,
    styles: [
      {
        id: "hideSocialWidget",
        title: "Скрыть виджет соцсетей",
        description: "Отключение плавающей кнопки соцсетей (.cback)",
        enabled: disableSocialWidget,
        onToggle: setDisableSocialWidget,
      },
      {
        id: "hideBitrixWidgets",
        title: "Скрыть CRM-виджетов",
        description: "Отключение CRM-виджетов",
        enabled: disableBitrixWidgets,
        onToggle: setDisableBitrixWidgets,
      },
      {
        id: "hideCallbackButtons",
        title: "Скрыть кнопки связи",
        description: "Отключение кнопок 'Заказать звонок' и 'Задать вопрос'",
        enabled: disableCallbackButtons,
        onToggle: setDisableCallbackButtons,
      },
      {
        id: "hideInvolveoWidget",
        title: "Скрыть Involveo",
        description: "Отключение виджета involveo-widget",
        enabled: disableInvolveoWidget,
        onToggle: setDisableInvolveoWidget,
      },
    ] as FeatureToggleItem[],

    enhancements: [
      {
        id: "sort-Highlight",
        title: "Подсветка seo_sort",
        description: "Показывает seo_sort и выделяет `> 5000`",
        enabled: sortHighlightEnable,
        onToggle: setSortHighlightEnable,
      },
      {
        id: "selectHelper",
        title: "Поиск по select",
        description: "Добавляет кнопку поиска рядом с select'ами свойств товара",
        enabled: selectHelperEnable,
        onToggle: setSelectHelperEnable,
      },
      {
        id: "propertySorter",
        title: "Сортировка свойств",
        description: "Добавляет кнопку автосортировки значений свойства типа 'список' в Битриксе",
        enabled: propertySorterEnable,
        onToggle: setPropertySorterEnable,
      },
      {
        id: "filterSortCheck",
        title: "Проверка сортировки фильтра",
        description: "Подсвечивает свойства в фильтре, где числовые значения идут не по порядку",
        enabled: filterSortCheckEnable,
        onToggle: setFilterSortCheckEnable,
      },
    ] as FeatureToggleItem[],
  };
}
