export default defineBackground(() => {
  if (import.meta.env.CHROME && chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(console.warn);
  }
});
