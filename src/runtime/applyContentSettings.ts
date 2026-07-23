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

export function applyDeferredSettings(settings: ExtensionSettings) {
  if (settings.sortHighlightEnabled) {
    sortHighlight.start();
  } else {
    sortHighlight.stop();
  }

  selectHelper.injectButtons();

  propertySorter.start();
  sectionSorter.start();
  sectionFilterSearch.start();
  gridSectionDropdownSearch.start();
  catalogEmptyPropertiesAudit.start();
  catalogEmptyPropertiesAudit.setPanelVisible(settings.catalogEmptyPropertiesPanelVisible);
  componentParamsVisibility.start();
  propertyTemplates.start();
  productMassEditor.start();

  if (settings.filterSortCheckEnabled) {
    filterSortCheck.start();
  } else {
    filterSortCheck.stop();
  }

  if (settings.imageInfoHighlightEnabled) {
    imageInfoHighlight.start();
  } else {
    imageInfoHighlight.stop();
  }

  productArticleHighlight.start();
}

export function applyContentSettings(settings: ExtensionSettings) {
  applyCriticalSettings(settings);
  applyDeferredSettings(settings);
}
