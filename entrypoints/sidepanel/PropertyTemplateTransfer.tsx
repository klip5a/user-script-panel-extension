import { useEffect, useRef, useState } from "preact/hooks";
import {
  EMPTY_PROPERTY_TEMPLATE_STORE,
  downloadPropertyTemplateStore,
  getPropertyTemplateStore,
  mergePropertyTemplateStore,
  parsePropertyTemplateJson,
  subscribeToPropertyTemplates,
  type PropertyTemplateStore,
} from "../../src/features/site-enhancements/property-templates";

const MAX_IMPORT_SIZE = 2 * 1024 * 1024;

export function PropertyTemplateTransfer() {
  const [store, setStore] = useState<PropertyTemplateStore>(EMPTY_PROPERTY_TEMPLATE_STORE);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getPropertyTemplateStore().then(setStore);
    return subscribeToPropertyTemplates(setStore);
  }, []);

  const exportTemplates = () => {
    if (store.templates.length === 0) {
      setStatus("Нет шаблонов для экспорта.");
      return;
    }

    downloadPropertyTemplateStore(store);
    setStatus(`Экспортировано шаблонов: ${store.templates.length}.`);
  };

  const importTemplates = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    setBusy(true);
    setStatus("");
    try {
      if (file.size > MAX_IMPORT_SIZE) {
        throw new Error("Файл слишком большой. Максимальный размер — 2 МБ.");
      }

      const imported = parsePropertyTemplateJson(await file.text());
      const result = await mergePropertyTemplateStore(imported);
      setStatus(`Импортировано: ${imported.templates.length}. Всего: ${result.templates.length}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось импортировать шаблоны.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section template-tools">
      <div className="section-heading">
        <h2>Шаблоны свойств</h2>
        <p>Резервная копия сохранённых наборов свойств в JSON.</p>
      </div>

      <div className="template-tools-card">
        <div className="template-tools-summary">
          <strong>{store.templates.length}</strong>
          <span>сохранённых шаблонов</span>
        </div>

        <div className="template-tools-actions">
          <button type="button" onClick={exportTemplates} disabled={busy || store.templates.length === 0}>
            Экспорт JSON
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
            {busy ? "Импорт…" : "Импорт JSON"}
          </button>
          <input
            ref={fileInputRef}
            className="template-tools-file"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importTemplates(event)}
          />
        </div>

        {status && <p className="template-tools-status" role="status">{status}</p>}
      </div>
    </section>
  );
}
