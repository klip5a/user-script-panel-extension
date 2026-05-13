import {
  DEFAULT_EXTENSION_SETTINGS,
  type ExtensionSettingKey,
  type ExtensionSettings
} from "./extensionSettings";

export async function getExtensionSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(DEFAULT_EXTENSION_SETTINGS);
  return {
    ...DEFAULT_EXTENSION_SETTINGS,
    ...stored
  } as ExtensionSettings;
}

export async function setExtensionSetting<K extends ExtensionSettingKey>(
  key: K,
  value: ExtensionSettings[K]
): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export function subscribeToExtensionSettings(
  callback: (settings: ExtensionSettings) => void
): () => void {
  const listener = (
    changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
    areaName: string
  ) => {
    if (areaName !== "local") return;

    const hasSettingsChange = Object.keys(DEFAULT_EXTENSION_SETTINGS).some((key) => key in changes);
    if (!hasSettingsChange) return;

    void getExtensionSettings().then(callback);
  };

  chrome.storage.onChanged.addListener(listener);

  return () => chrome.storage.onChanged.removeListener(listener);
}
