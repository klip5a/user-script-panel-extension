export interface ProductGridContext {
  grid: HTMLElement;
  table: HTMLTableElement;
  actionPanel: HTMLElement | null;
}

export type ProductFieldKind =
  | "text"
  | "checkbox-group"
  | "checkbox-single"
  | "select-multiple"
  | "linked-element";

export interface ProductFieldOption {
  value: string;
  label: string;
}

export interface ProductFieldDescriptor {
  id: string;
  title: string;
  displayTitle: string;
  kind: ProductFieldKind;
  options: ProductFieldOption[];
  searchUrl: string | null;
}

export interface ProductMassEditorFieldState {
  mode: string;
  textValue: string;
  selectedValues: string[];
  linkedQuery: string;
  linkedSelectedValue: string;
  linkedOptions: ProductFieldOption[];
  linkedLoading: boolean;
}

export interface ProductMassEditorDraft {
  key: string;
  fieldId: string;
  active: boolean;
  fieldState: ProductMassEditorFieldState | null;
}
