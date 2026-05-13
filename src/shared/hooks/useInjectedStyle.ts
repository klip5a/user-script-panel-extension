import { useEffect } from "preact/hooks";

// Управляет одиночным style-тегом: добавляет CSS при enabled и удаляет при выключении.
export function useInjectedStyle(id: string, css: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      const exists = document.getElementById(id);
      if (exists && exists.parentNode) exists.parentNode.removeChild(exists);
      return;
    }

    let styleEl = document.getElementById(id) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = id;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = css;

    return () => {
      const el = document.getElementById(id);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    };
  }, [id, css, enabled]);
}
