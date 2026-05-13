import { applyContentSettings } from "../src/runtime/applyContentSettings";
import { getExtensionSettings, subscribeToExtensionSettings } from "../src/settings/storage";

async function initContentRuntime() {
  applyContentSettings(await getExtensionSettings());
  subscribeToExtensionSettings(applyContentSettings);
}

export default defineContentScript({
  matches: ["https://cnc1.ru/*", "https://www.cnc1.ru/*"],
  runAt: "document_idle",
  main() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => void initContentRuntime(), {
        once: true
      });
      return;
    }

    void initContentRuntime();
  }
});
