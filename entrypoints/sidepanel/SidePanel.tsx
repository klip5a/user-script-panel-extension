import { useEffect, useRef, useState } from "preact/hooks";
import {
  DEFAULT_EXTENSION_SETTINGS,
  ENHANCEMENT_SETTINGS,
  STYLE_SETTINGS,
  type BooleanSettingKey,
  type ExtensionSettings,
  type SettingItem,
} from "../../src/settings/extensionSettings";
import {
  getExtensionSettings,
  setExtensionSettings,
  subscribeToExtensionSettings,
} from "../../src/settings/storage";
import { PropertyTemplateTransfer } from "./PropertyTemplateTransfer";

function ToggleRow({
  item,
  checked,
  onChange,
}: {
  item: SettingItem;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>{item.title}</strong>
        <small>{item.description}</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function SettingsSection({
  title,
  description,
  items,
  settings,
  onToggle,
  collapsible = false,
  defaultCollapsed = false,
}: {
  title: string;
  description: string;
  items: SettingItem[];
  settings: ExtensionSettings;
  onToggle: (key: BooleanSettingKey, value: boolean) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const listId = `settings-list-${title.toLocaleLowerCase("ru-RU").replace(/\s+/g, "-")}`;

  return (
    <section className="settings-section" data-collapsible={collapsible ? "true" : undefined}>
      <div className="section-heading">
        <div className="section-title-row">
          <h2>{title}</h2>
          {collapsible ? (
            <button
              type="button"
              className="section-collapse"
              aria-expanded={!collapsed}
              aria-controls={listId}
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed ? "Показать" : "Скрыть"}
              <span aria-hidden="true">{collapsed ? "▾" : "▴"}</span>
            </button>
          ) : null}
        </div>
        <p>{description}</p>
      </div>
      <div className="settings-list" id={listId} hidden={collapsible && collapsed}>
        {items.map((item) => (
          <ToggleRow
            key={item.key}
            item={item}
            checked={settings[item.key]}
            onChange={(value) => onToggle(item.key, value)}
          />
        ))}
      </div>
    </section>
  );
}

export function SidePanel() {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_EXTENSION_SETTINGS);
  // Счётчик записей защищает rollback от перетирания более нового успешного действия.
  const writeVersionRef = useRef(0);

  useEffect(() => {
    void getExtensionSettings()
      .then(setSettings)
      .catch(() => setSettings({ ...DEFAULT_EXTENSION_SETTINGS }));
    return subscribeToExtensionSettings(setSettings);
  }, []);

  const persistSettings = (updates: Partial<ExtensionSettings>) => {
    const version = ++writeVersionRef.current;
    setSettings((current) => ({ ...current, ...updates }));

    void setExtensionSettings(updates).catch(() => {
      // Если за это время пользователь успел сделать новую запись, её завершение
      // само приведёт UI к актуальному состоянию; откатываем только устаревший оптимизм.
      if (writeVersionRef.current !== version) return;

      void getExtensionSettings()
        .then(setSettings)
        .catch(() => setSettings({ ...DEFAULT_EXTENSION_SETTINGS }));
    });
  };

  const updateBooleanSetting = (key: BooleanSettingKey, value: boolean) => {
    if (key === "catalogEmptyPropertiesPanelVisible" && value) {
      const updates = {
        catalogEmptyPropertiesHighlightEnabled: true,
        catalogEmptyPropertiesPanelVisible: true,
      };
      persistSettings(updates);
      return;
    }

    if (key === "catalogEmptyPropertiesHighlightEnabled" && !value) {
      const updates = {
        catalogEmptyPropertiesHighlightEnabled: false,
        catalogEmptyPropertiesPanelVisible: false,
      };
      persistSettings(updates);
      return;
    }

    persistSettings({ [key]: value });
  };

  return (
    <main className="sidepanel">
      <header className="app-header">
        <div>
          <h1>CNC1 UserPanel</h1>
          <p>Настройки расширения администратора</p>
        </div>
        <span className="status">cnc1.ru</span>
      </header>

      <SettingsSection
        title="Инструменты"
        description="Удобства для ежедневной работы с каталогом и админкой Bitrix."
        items={ENHANCEMENT_SETTINGS}
        settings={settings}
        onToggle={updateBooleanSetting}
      />

      <SettingsSection
        title="Стили"
        description="Скрытие виджетов и элементов, которые мешают администрированию."
        items={STYLE_SETTINGS}
        settings={settings}
        onToggle={updateBooleanSetting}
        collapsible
        defaultCollapsed
      />

      <PropertyTemplateTransfer />
    </main>
  );
}
