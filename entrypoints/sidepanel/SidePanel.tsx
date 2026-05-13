import { useEffect, useState } from "preact/hooks";
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
  setExtensionSetting,
  subscribeToExtensionSettings,
} from "../../src/settings/storage";

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
}: {
  title: string;
  description: string;
  items: SettingItem[];
  settings: ExtensionSettings;
  onToggle: (key: BooleanSettingKey, value: boolean) => void;
}) {
  return (
    <section className="settings-section">
      <div className="section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="settings-list">
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

  useEffect(() => {
    void getExtensionSettings().then(setSettings);
    return subscribeToExtensionSettings(setSettings);
  }, []);

  const updateBooleanSetting = (key: BooleanSettingKey, value: boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
    void setExtensionSetting(key, value);
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
        title="Улучшения"
        description="Инструменты, которые меняют или дополняют рабочие страницы Bitrix."
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
      />
    </main>
  );
}
