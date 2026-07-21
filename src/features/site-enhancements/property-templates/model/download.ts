import { parsePropertyTemplateStore } from "./storage";
import type { PropertyTemplateStore } from "./types";

export function downloadPropertyTemplateStore(
  store: PropertyTemplateStore,
  doc: Document = document,
): void {
  const validated = parsePropertyTemplateStore(store);
  const view = doc.defaultView ?? window;
  const blob = new Blob([JSON.stringify(validated, null, 2)], { type: "application/json" });
  const url = view.URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = `cnc1-property-templates-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.hidden = true;
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
}
