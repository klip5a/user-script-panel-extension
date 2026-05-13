import { useEffect, useState } from "preact/hooks";
import type { PanelPlacement } from "../types";

export function useStoredPlacement(key: string, initial: PanelPlacement) {
  const [value, setValue] = useState<PanelPlacement>(() => {
    try {
      const raw = localStorage.getItem(key) as PanelPlacement | null;
      return raw ?? initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}
