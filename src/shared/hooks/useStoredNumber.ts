import { useEffect, useState } from "preact/hooks";

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
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}
