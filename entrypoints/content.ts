import "./content/view-transitions.css";

import { applyCriticalSettings, applyDeferredSettings } from "../src/runtime/applyContentSettings";
import { getExtensionSettings, subscribeToExtensionSettings } from "../src/settings/storage";

// Точка входа content script: применяем сохраненные настройки и дальше реагируем на изменения.
async function initContentRuntime() {
  const settings = await getExtensionSettings();

  // 1. Критические настройки (CSS) применяем как можно раньше
  applyCriticalSettings(settings);

  // 2. Отложенные настройки (DOM-фичи) применяем только когда страница и пользователь полностью "успокоились"
  let isDeferredStarted = false;
  const startDeferred = () => {
    if (isDeferredStarted) return;
    isDeferredStarted = true;

    // Убираем слушатели, чтобы не засорять память
    window.removeEventListener("scroll", startDeferred);
    window.removeEventListener("mousemove", startDeferred);
    window.removeEventListener("keydown", startDeferred);
    window.removeEventListener("touchstart", startDeferred);

    // Запускаем тяжелые вычисления только когда основной поток свободен
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => applyDeferredSettings(settings), { timeout: 2000 });
    } else {
      setTimeout(() => applyDeferredSettings(settings), 100);
    }
  };

  // Ждем полной загрузки страницы, а затем еще 2.5 секунды, чтобы дать браузеру догрузить lazy-картинки
  if (document.readyState === "complete") {
    setTimeout(startDeferred, 2500);
  } else {
    window.addEventListener("load", () => setTimeout(startDeferred, 2500), { once: true });
  }

  // Либо запускаем раньше, если пользователь начал активно взаимодействовать со страницей
  window.addEventListener("scroll", startDeferred, { once: true, passive: true });
  window.addEventListener("mousemove", startDeferred, { once: true, passive: true });
  window.addEventListener("keydown", startDeferred, { once: true, passive: true });
  window.addEventListener("touchstart", startDeferred, { once: true, passive: true });

  // 3. Подписываемся на изменения настроек из UI
  subscribeToExtensionSettings((newSettings) => {
    applyCriticalSettings(newSettings);
    if (isDeferredStarted) {
      applyDeferredSettings(newSettings);
    } else {
      // Если юзер изменил настройки, значит он активен, можно запускать
      Object.assign(settings, newSettings);
      startDeferred();
    }
  });
}

export default defineContentScript({
  matches: ["https://cnc1.ru/*", "https://www.cnc1.ru/*"],
  runAt: "document_start",
  main() {
    // В content.ts мы используем document_start, чтобы успеть вставить CSS до рендера.
    // Если head недоступен, ждем DOMContentLoaded для критических стилей.
    if (!document.head && document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => void initContentRuntime(), {
        once: true
      });
      return;
    }

    void initContentRuntime();
  }
});
