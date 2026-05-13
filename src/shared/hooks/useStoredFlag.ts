import { useEffect, useState } from "preact/hooks";

// Локальный хук для старых UI-настроек: хранит boolean как "1"/"0" в localStorage.
export function useStoredFlag(key: string, initial: boolean) {
  const [val, setVal] = useState<boolean>(() => {
    try {
      const s = localStorage.getItem(key);
      return s == null ? initial : s === "1";
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, val ? "1" : "0");
    } catch {
      // localStorage может быть недоступен в приватном режиме или при ограничениях браузера.
    }
  }, [key, val]);

  return [val, setVal] as const;
}
