import {
  catalogEmptyPropertiesAudit,
  filterSortCheck,
  gridSectionDropdownSearch,
  imageInfoHighlight,
  productArticleHighlight,
  productMassEditor,
  propertyTemplates,
  propertySorter,
  sectionFilterSearch,
  sectionSorter,
  componentParamsVisibility,
  selectHelper,
  sortHighlight,
} from "../features";
import type { ExtensionSettings } from "../settings/extensionSettings";
import { FeatureRegistry } from "./featureRegistry";

// CSS-правки держим рядом с runtime-логикой, потому что они включаются настройками без React UI.
const HIDE_SOCIAL_WIDGET_CSS = `
  .cback, .cback .mes, .cback .open_form {
    opacity: 0 !important;
    pointer-events: none !important;
  }
`;

const HIDE_BITRIX_WIDGETS_CSS = `
  .b24-widget-button-popup,
  .b24-widget-button-social,
  .b24-widget-button-inner-container {
    display: none !important;
  }
`;

const HIDE_AI_CHAT_CSS = `
  #cnc1-ai-btn,
  #cnc1-ai-chat,
  #cnc1-ai-chat-overlay {
    display: none !important;
  }
`;

const HIDE_CALLBACK_BUTTONS_CSS = `
  .wrap_cont .opener {
    display: none !important;
  }
`;

const HIDE_INVOLVEO_WIDGET_CSS = `
  involveo-widget {
    display: none !important;
  }
`;

// Один и тот же style-тег переиспользуется при переключении настройки, чтобы не плодить дубли.
function setInjectedStyle(id: string, css: string, enabled: boolean) {
  const existing = document.getElementById(id);

  if (!enabled) {
    existing?.remove();
    return;
  }

  const style = existing ?? document.createElement("style");
  style.id = id;
  style.textContent = css;

  if (!existing) {
    document.head.appendChild(style);
  }
}

export function applyCriticalSettings(settings: ExtensionSettings) {
  setInjectedStyle(
    "cnc1-userpanel-hide-social-widget",
    HIDE_SOCIAL_WIDGET_CSS,
    settings.hideSocialWidget
  );
  setInjectedStyle(
    "cnc1-userpanel-hide-bitrix-widgets",
    HIDE_BITRIX_WIDGETS_CSS,
    settings.hideBitrixWidgets
  );
  setInjectedStyle(
    "cnc1-userpanel-hide-ai-chat",
    HIDE_AI_CHAT_CSS,
    settings.hideAiChat
  );
  setInjectedStyle(
    "cnc1-userpanel-hide-callback-buttons",
    HIDE_CALLBACK_BUTTONS_CSS,
    settings.hideCallbackButtons
  );
  setInjectedStyle(
    "cnc1-userpanel-hide-involveo-widget",
    HIDE_INVOLVEO_WIDGET_CSS,
    settings.hideInvolveoWidget
  );
}

const contentFeatureRegistry = new FeatureRegistry([
  {
    name: "sortHighlight",
    isEnabled: (settings) => settings.sortHighlightEnabled,
    start: () => sortHighlight.start(),
    stop: () => sortHighlight.stop(),
  },
  {
    name: "selectHelper",
    isEnabled: () => true,
    start: () => selectHelper.injectButtons(),
    stop: () => selectHelper.removeButtons(),
    // Инжектирующая фича: как и раньше, сканирование повторяется при каждом применении.
    apply: () => selectHelper.injectButtons(),
  },
  {
    name: "propertySorter",
    isEnabled: () => true,
    start: () => propertySorter.start(),
    stop: () => propertySorter.stop(),
  },
  {
    name: "sectionSorter",
    isEnabled: () => true,
    start: () => sectionSorter.start(),
    stop: () => sectionSorter.stop(),
  },
  {
    name: "sectionFilterSearch",
    isEnabled: () => true,
    start: () => sectionFilterSearch.start(),
    stop: () => sectionFilterSearch.stop(),
  },
  {
    name: "gridSectionDropdownSearch",
    isEnabled: () => true,
    start: () => gridSectionDropdownSearch.start(),
    stop: () => gridSectionDropdownSearch.stop(),
  },
  {
    name: "catalogEmptyPropertiesAudit",
    isEnabled: (settings) =>
      settings.catalogEmptyPropertiesHighlightEnabled ||
      settings.catalogEmptyPropertiesPanelVisible,
    start: (settings) => {
      catalogEmptyPropertiesAudit.start();
      catalogEmptyPropertiesAudit.setPanelVisible(settings.catalogEmptyPropertiesPanelVisible);
    },
    stop: () => catalogEmptyPropertiesAudit.stop(),
    // Видимость панели меняется независимо от highlight: переприменяем при каждом апдейте.
    apply: (settings) => {
      catalogEmptyPropertiesAudit.start();
      catalogEmptyPropertiesAudit.setPanelVisible(settings.catalogEmptyPropertiesPanelVisible);
    },
  },
  {
    name: "componentParamsVisibility",
    isEnabled: () => true,
    start: () => componentParamsVisibility.start(),
    stop: () => componentParamsVisibility.stop(),
  },
  {
    name: "propertyTemplates",
    isEnabled: () => true,
    start: () => propertyTemplates.start(),
    stop: () => propertyTemplates.stop(),
  },
  {
    name: "productMassEditor",
    isEnabled: () => true,
    start: () => productMassEditor.start(),
    stop: () => productMassEditor.stop(),
  },
  {
    name: "filterSortCheck",
    isEnabled: (settings) => settings.filterSortCheckEnabled,
    start: () => filterSortCheck.start(),
    stop: () => filterSortCheck.stop(),
  },
  {
    name: "imageInfoHighlight",
    isEnabled: (settings) => settings.imageInfoHighlightEnabled,
    start: () => imageInfoHighlight.start(),
    stop: () => imageInfoHighlight.stop(),
  },
  {
    name: "productArticleHighlight",
    isEnabled: () => true,
    start: () => productArticleHighlight.start(),
    stop: () => productArticleHighlight.stop(),
  },
]);

export function applyDeferredSettings(settings: ExtensionSettings) {
  contentFeatureRegistry.apply(settings);
}

export function stopContentFeatures(): void {
  contentFeatureRegistry.stopAll();
}

export function applyContentSettings(settings: ExtensionSettings) {
  applyCriticalSettings(settings);
  applyDeferredSettings(settings);
}
