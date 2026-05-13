export default defineBackground(() => {
  // В Chrome открываем side panel кликом по иконке расширения; в других браузерах API может отсутствовать.
  if (import.meta.env.CHROME && chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.warn);
  }
});
