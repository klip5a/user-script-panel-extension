export type ProductTargetSource = "selected" | "codes";

export type ProductRowSelectionState = {
  isInlineEditable: boolean;
  isHidden: boolean;
  isTemplate: boolean;
  checkboxChecked: boolean;
  hasCheckedRowClass: boolean;
};

export function isSelectedEditableProductRow(state: ProductRowSelectionState): boolean {
  return (
    state.isInlineEditable &&
    !state.isHidden &&
    !state.isTemplate &&
    (state.checkboxChecked || state.hasCheckedRowClass)
  );
}
