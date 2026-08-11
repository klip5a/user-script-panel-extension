import "./content/view-transitions.css";

import { ContentRuntimeController } from "../src/runtime/contentRuntime";
import {
  applyCriticalSettings,
  applyDeferredSettings,
  stopContentFeatures,
} from "../src/runtime/applyContentSettings";
import {
  getExtensionSettings,
  subscribeToExtensionSettings,
} from "../src/settings/storage";

export default defineContentScript({
  matches: [
    "https://cnc1.ru/*",
    "https://www.cnc1.ru/*",
    "https://xn--80akihldccewegghem.xn--p1ai/*",
    "https://technowood.ru/*"
  ],
  runAt: "document_start",
  main(ctx) {
    let controller: ContentRuntimeController | null = null;

    // Единый cleanup до любых веток инициализации: инвалидация до старта безопасна,
    // а cleanup идемпотентно останавливает фичи и контроллер, если он был создан.
    const cleanup = () => {
      controller?.dispose();
      controller = null;
      stopContentFeatures();
    };
    ctx.onInvalidated(cleanup);

    const start = () => {
      // Игнорируем запуск после инвалидации и предотвращаем повторную инициализацию.
      if (!ctx.isValid || controller) return;

      controller = new ContentRuntimeController({
        getSettings: getExtensionSettings,
        subscribe: subscribeToExtensionSettings,
        applyCritical: applyCriticalSettings,
        applyDeferred: applyDeferredSettings,
        window,
        document,
      });
      void controller.start();
    };

    // В content.ts мы используем document_start, чтобы успеть вставить CSS до рендера.
    // Если head недоступен, ждем DOMContentLoaded для критических стилей.
    if (!document.head && document.readyState === "loading") {
      ctx.addEventListener(document, "DOMContentLoaded", start, { once: true });
      return;
    }

    start();
  }
});
