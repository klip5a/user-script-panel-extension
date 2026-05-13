import { applyContentSettings } from "../src/runtime/applyContentSettings";
import { getExtensionSettings, subscribeToExtensionSettings } from "../src/settings/storage";

// Точка входа content script: применяем сохраненные настройки и дальше реагируем на изменения.
async function initContentRuntime() {
  applyContentSettings(await getExtensionSettings());
  subscribeToExtensionSettings(applyContentSettings);
}

export default defineContentScript({
  matches: ["https://cnc1.ru/*", "https://www.cnc1.ru/*"],
  runAt: "document_idle",
  main() {
    // Некоторые DOM-улучшения читают body/head, поэтому на ранней загрузке ждем готовности DOM.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => void initContentRuntime(), {
        once: true
      });
      return;
    }

    void initContentRuntime();
  }
});
