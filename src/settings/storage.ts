import {
  DEFAULT_EXTENSION_SETTINGS,
  normalizeExtensionSettings,
  normalizeSettingsPatch,
  type ExtensionSettingKey,
  type ExtensionSettings
} from "./extensionSettings";

// Храним настройки в chrome.storage.local, чтобы они были доступны и панели, и content script.
export async function getExtensionSettings(): Promise<ExtensionSettings> {
  try {
    const stored = await chrome.storage.local.get(DEFAULT_EXTENSION_SETTINGS);
    return normalizeExtensionSettings(stored);
  } catch (error) {
    // Отказ storage не должен отключать runtime: возвращаем безопасные defaults.
    console.warn(
      "[Settings] Не удалось прочитать настройки, используем значения по умолчанию:",
      error,
    );
    return { ...DEFAULT_EXTENSION_SETTINGS };
  }
}

export async function setExtensionSetting<K extends ExtensionSettingKey>(
  key: K,
  value: ExtensionSettings[K]
): Promise<void> {
  await setExtensionSettings({ [key]: value } as Partial<ExtensionSettings>);
}

export async function setExtensionSettings(
  settings: Partial<ExtensionSettings>
): Promise<void> {
  const patch = normalizeSettingsPatch(settings);
  if (Object.keys(patch).length === 0) return;
  await chrome.storage.local.set(patch);
}

export function subscribeToExtensionSettings(
  callback: (settings: ExtensionSettings) => void
): () => void {
  // Per-subscription revision: async-чтение, стартовавшее раньше, не может
  // доставить callback после более свежего события изменения/чтения.
  let revision = 0;

  // Chrome присылает изменения по ключам; пересобираем весь объект настроек для единого API.
  const listener = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string
  ) => {
    if (areaName !== "local") return;

    // Игнорируем чужие ключи storage.local, чтобы не дергать DOM-улучшения без причины.
    const hasSettingsChange = Object.keys(DEFAULT_EXTENSION_SETTINGS).some((key) => key in changes);
    if (!hasSettingsChange) return;

    const readRevision = ++revision;
    void getExtensionSettings()
      .then((settings) => {
        // Устаревшее чтение (обогнанное новым событием) не должно перезаписывать актуальное состояние.
        if (readRevision !== revision) return;
        callback(settings);
      })
      .catch((error) => {
        // Подписка не должна порождать unhandled rejection: runtime остаётся рабочим.
        console.warn("[Settings] Не удалось обработать изменение настроек:", error);
      });
  };

  chrome.storage.onChanged.addListener(listener);

  return () => {
    // Инвалидируем незавершённые чтения при отписке.
    revision += 1;
    chrome.storage.onChanged.removeListener(listener);
  };
}
