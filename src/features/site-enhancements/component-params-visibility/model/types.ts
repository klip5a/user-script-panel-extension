export interface ComponentParamsRow {
  key: string;
  groupKey: string;
  groupTitle: string;
  propertyId: string;
  label: string;
  row: HTMLTableRowElement;
}

export interface ComponentParamsGroup {
  key: string;
  title: string;
  titleRow: HTMLTableRowElement;
  rows: ComponentParamsRow[];
}

export interface ComponentParamsDialogContext {
  dialog: HTMLElement;
  form: HTMLFormElement | null;
  groups: ComponentParamsGroup[];
  storageKey: string;
  title: string;
}

export interface ComponentParamsMatrixColumn {
  key: string;
  title: string;
  propertyIds: string[];
  groupIds?: string[];
}

export interface ComponentParamsMatrixRow {
  key: string;
  propertyId: string;
  label: string;
  cells: Record<string, boolean>;
}
