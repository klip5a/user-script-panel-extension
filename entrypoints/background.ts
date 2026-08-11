import { browser } from "wxt/browser";
import {
  createMutationQueue,
  createStoreMutationHandler,
  isStoreMutationMessage,
} from "../src/features/site-enhancements/property-templates/model/coordinator";

export default defineBackground(() => {
  // В Chrome открываем side panel кликом по иконке расширения; в других браузерах API может отсутствовать.
  if (import.meta.env.CHROME && chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);
  }

  // Authoritative-координатор общих хранилищ: типизированные мутации шаблонов
  // свойств и сохранённых шапок разделов сериализуются одной очередью.
  const queue = createMutationQueue();
  const handleStoreMutation = createStoreMutationHandler(browser.storage.local);

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!isStoreMutationMessage(message)) return;
    return queue.enqueue(() => handleStoreMutation(message));
  });
});
