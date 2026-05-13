export function Popup() {
  const openSidePanel = async () => {
    if (!import.meta.env.CHROME || !chrome.sidePanel) return;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.windowId) {
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    }
  };

  return (
    <main className="popup">
      <header>
        <strong>CNC1 UserPanel</strong>
        <span>Расширение администратора</span>
      </header>

      <section>
        <button type="button" onClick={openSidePanel}>
          Открыть боковую панель
        </button>
      </section>

      <p>
        Быстрые инструменты работают прямо на странице через content script. Настройки и крупные
        сценарии лучше переносить в боковую панель.
      </p>
    </main>
  );
}
