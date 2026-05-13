import { useEffect, useState } from "preact/hooks";

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
      // ignore
    }
  }, [key, val]);

  return [val, setVal] as const;
}
