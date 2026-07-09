import { useEffect, useState } from "preact/hooks";

// Локальный хук для числовых UI-настроек с безопасным fallback на initial.
export function useStoredNumber(key: string, initial: number) {
  const [value, setValue] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw != null ? Number(raw) : NaN;
      return Number.isFinite(n) ? n : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, String(value));
    } catch {
      // Ошибка записи не должна ломать интерфейс панели.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
