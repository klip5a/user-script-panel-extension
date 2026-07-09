import { useEffect } from "preact/hooks";
import { useStoredFlag } from "../../../../shared";
import { sortHighlight } from "../sort-highlight";

export function useSortHighlight({ panelEnabled }: { panelEnabled: boolean }) {
  const [enabled, setEnabled] = useStoredFlag("userScriptPanel.seo_sort_highlight.enabled", false);

  useEffect(() => {
    if (panelEnabled && enabled) {
      sortHighlight.start();
    } else {
      sortHighlight.stop();
    }
  }, [panelEnabled, enabled]);

  return {
    enabled,
    setEnabled,
  };
}
