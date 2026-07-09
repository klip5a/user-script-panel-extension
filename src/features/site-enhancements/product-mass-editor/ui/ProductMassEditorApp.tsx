import type {
  ProductFieldDescriptor,
  ProductMassEditorDraft,
  ProductMassEditorFieldState,
} from "../types";

type ProductMassEditorAppProps = {
  open: boolean;
  subtitle: string;
  codes: string;
  fields: ProductFieldDescriptor[];
  drafts: ProductMassEditorDraft[];
  onClose: () => void;
  onApply: () => void;
  onCodesChange: (value: string) => void;
  onDraftActiveChange: (draftKey: string, active: boolean) => void;
  onFieldModeChange: (draftKey: string, mode: string) => void;
  onFieldTextChange: (draftKey: string, value: string) => void;
  onFieldToggleValue: (draftKey: string, value: string) => void;
  onFieldLinkedQueryChange: (draftKey: string, value: string) => void;
  onFieldLinkedSelectedValueChange: (draftKey: string, value: string) => void;
};

const panelStyles = {
  display: "grid",
  gridTemplateRows: "auto 1fr auto",
  height: "min(86vh, 980px)",
  minHeight: "0",
} as const;

const inputBaseStyles = {
  width: "100%",
  height: "40px",
  borderRadius: "10px",
  border: "1px solid #bfd2ca",
  padding: "0 12px",
  background: "#fff",
  color: "#17352f",
  fontSize: "14px",
  boxSizing: "border-box",
} as const;

function renderFieldEditor(
  props: ProductMassEditorAppProps,
  draft: ProductMassEditorDraft,
  field: ProductFieldDescriptor,
  state: ProductMassEditorFieldState,
) {
  if (!field || !state) return null;

  const modeOptions = (() => {
    switch (field.kind) {
      case "text":
        return [
          { value: "replace", label: "Заменить значение" },
          { value: "clear", label: "Очистить значение" },
        ];
      case "checkbox-group":
      case "select-multiple":
        return [
          { value: "replace", label: "Заменить набор значений" },
          { value: "add", label: "Добавить выбранные значения" },
          { value: "remove", label: "Снять выбранные значения" },
          { value: "clear", label: "Очистить поле" },
        ];
      case "checkbox-single":
        return [
          { value: "check", label: "Включить" },
          { value: "uncheck", label: "Выключить" },
        ];
      case "linked-element":
        return [
          { value: "replace", label: "Поставить выбранное значение" },
          { value: "clear", label: "Очистить поле" },
        ];
    }
  })();

  return (
    <div style={{ display: "grid", gap: "12px", alignContent: "start" }}>
      <label style={{ display: "grid", gap: "6px" }}>
        <span style={{ fontSize: "12px", fontWeight: "700", color: "#35574d" }}>Режим</span>
        <select
          value={state.mode}
          onInput={(event) =>
            props.onFieldModeChange(draft.key, (event.currentTarget as HTMLSelectElement).value)
          }
          style={inputBaseStyles}
        >
          {modeOptions.map((option) => (
            <option value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>

      {field.kind === "text" && state.mode !== "clear" ? (
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#35574d" }}>Новое значение</span>
          <input
            type="text"
            value={state.textValue}
            onInput={(event) => props.onFieldTextChange(draft.key, (event.currentTarget as HTMLInputElement).value)}
            style={inputBaseStyles}
          />
        </label>
      ) : null}

      {(field.kind === "checkbox-group" || field.kind === "select-multiple") && state.mode !== "clear" ? (
        <div style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#35574d" }}>Значения</span>
          <div
            style={{
              display: "grid",
              gap: "8px",
              maxHeight: "320px",
              overflow: "auto",
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #d6e3dc",
              background: "#fff",
            }}
          >
            {field.options.map((option) => (
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#23423a",
                }}
              >
                <input
                  type="checkbox"
                  checked={state.selectedValues.includes(option.value)}
                  onInput={() => props.onFieldToggleValue(draft.key, option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {field.kind === "linked-element" && state.mode !== "clear" ? (
        <div style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", color: "#35574d" }}>Поиск значения</span>
          <input
            type="search"
            value={state.linkedQuery}
            onInput={(event) =>
              props.onFieldLinkedQueryChange(draft.key, (event.currentTarget as HTMLInputElement).value)
            }
            placeholder="Начни вводить бренд"
            style={inputBaseStyles}
          />
          <div
            style={{
              display: "grid",
              gap: "8px",
              maxHeight: "320px",
              overflow: "auto",
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #d6e3dc",
              background: "#fff",
            }}
          >
            {state.linkedLoading ? (
              <div style={{ fontSize: "12px", color: "#6b817a" }}>Загружаю список значений...</div>
            ) : null}
            {!state.linkedLoading && state.linkedOptions.length === 0 ? (
              <div style={{ fontSize: "12px", color: "#6b817a" }}>Совпадений не найдено.</div>
            ) : null}
            {state.linkedOptions.map((option) => (
              <label
                style={{
                  display: "grid",
                  gridTemplateColumns: "16px minmax(0, 1fr)",
                  gap: "8px",
                  alignItems: "start",
                  fontSize: "13px",
                  color: "#23423a",
                }}
              >
                <input
                  type="radio"
                  name={`product-mass-linked-option-${draft.key}`}
                  checked={state.linkedSelectedValue === option.value}
                  onInput={() => props.onFieldLinkedSelectedValueChange(draft.key, option.value)}
                />
                <span>{`${option.label} [${option.value}]`}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProductMassEditorApp(props: ProductMassEditorAppProps) {
  if (!props.open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: "0",
        zIndex: "999998",
        display: "grid",
        placeItems: "center",
        background: "rgba(15, 23, 42, 0.42)",
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div
        style={{
          width: "min(1040px, calc(100vw - 48px))",
          maxWidth: "1040px",
          borderRadius: "16px",
          background: "#f4f7f5",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
          overflow: "hidden",
        }}
      >
        <div style={panelStyles}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              padding: "20px 24px",
              borderBottom: "1px solid #d7e2dc",
              background: "linear-gradient(135deg, #f8fffd 0%, #edf7f3 100%)",
            }}
          >
            <div>
              <h1
                style={{
                  margin: "0",
                  fontSize: "24px",
                  lineHeight: "1.2",
                  color: "#16302b",
                  fontWeight: "700",
                }}
              >
                Массовое редактирование товаров
              </h1>
              <div style={{ marginTop: "6px", fontSize: "13px", color: "#5b6f69" }}>{props.subtitle}</div>
            </div>

            <button
              type="button"
              onClick={props.onClose}
              style={{
                height: "38px",
                padding: "0 16px",
                borderRadius: "8px",
                border: "1px solid #c7d5cf",
                background: "#fff",
                color: "#24433b",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Закрыть
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(320px, 1fr) minmax(320px, 420px)",
              gap: "0",
              minHeight: "0",
            }}
          >
            <section
              style={{
                display: "grid",
                gridTemplateRows: "auto auto minmax(0, 1fr) auto",
                gap: "12px",
                padding: "20px 18px",
                borderRight: "1px solid #d7e2dc",
                background: "#eef6f2",
              }}
            >
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#17352f" }}>Коды товаров</div>
              <div style={{ fontSize: "12px", lineHeight: "1.45", color: "#5f746d" }}>
                Вставляй по одному коду в строку. Таблица справа отфильтруется по совпадениям.
              </div>
              <textarea
                value={props.codes}
                onInput={(event) => props.onCodesChange((event.currentTarget as HTMLTextAreaElement).value)}
                placeholder={"00104461\n00104462"}
                style={{
                  width: "100%",
                  height: "100%",
                  resize: "none",
                  borderRadius: "12px",
                  border: "1px solid #bfd2ca",
                  padding: "14px",
                  fontSize: "14px",
                  lineHeight: "1.5",
                  background: "#fff",
                  color: "#17352f",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              <div
                style={{
                  fontSize: "12px",
                  lineHeight: "1.5",
                  color: "#60756d",
                  padding: "12px",
                  borderRadius: "12px",
                  background: "#f3f8f5",
                  border: "1px solid #dce7e1",
                }}
              >
                Вставь коды товаров по одному в строку, затем выбери свойство справа и укажи, что с ним сделать.
              </div>
            </section>

            <aside
              style={{
                display: "grid",
                gridTemplateRows: "auto minmax(0, 1fr) auto",
                gap: "14px",
                padding: "20px 18px",
                borderLeft: "1px solid #d7e2dc",
                background: "#f9fcfb",
                minHeight: "0",
                overflow: "hidden",
              }}
            >
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#17352f" }}>Что сделать массово</div>

              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  alignContent: "start",
                  overflowY: "auto",
                  overflowX: "hidden",
                  minHeight: 0,
                  paddingRight: "4px",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    lineHeight: "1.5",
                    color: "#60756d",
                    padding: "12px",
                    borderRadius: "12px",
                    background: "#edf5f1",
                    border: "1px solid #d6e3dc",
                  }}
                >
                  Изменения применятся к товарам, чьи коды найдены среди строк в текущем режиме редактирования.
                </div>

                {props.drafts.map((draft, index) => {
                  const field = props.fields.find((item) => item.id === draft.fieldId);
                  const state = draft.fieldState;

                  return (
                    <section
                      key={draft.key}
                      style={{
                        display: "grid",
                        gap: "12px",
                        padding: "14px",
                        borderRadius: "14px",
                        border: "1px solid #d6e3dc",
                        background: "#fff",
                      }}
                    >
                      <label
                        style={{
                          display: "grid",
                          gridTemplateColumns: "16px minmax(0, 1fr)",
                          gap: "10px",
                          alignItems: "start",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onInput={(event) =>
                            props.onDraftActiveChange(
                              draft.key,
                              (event.currentTarget as HTMLInputElement).checked,
                            )
                          }
                        />
                        <div style={{ display: "grid", gap: "2px" }}>
                          <div style={{ fontSize: "13px", fontWeight: "700", color: "#23423a" }}>
                            {field?.displayTitle || `Свойство ${index + 1}`}
                          </div>
                          <div style={{ fontSize: "12px", color: "#62756f" }}>
                            Отметь, если это свойство нужно массово заполнить
                          </div>
                        </div>
                      </label>

                      {draft.active && field && state ? renderFieldEditor(props, draft, field, state) : null}
                    </section>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={props.onApply}
                style={{
                  height: "42px",
                  padding: "0 14px",
                  borderRadius: "10px",
                  border: "1px solid #0f766e",
                  background: "#14b8a6",
                  color: "#062c2c",
                  fontSize: "14px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Заполнить
              </button>
            </aside>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              padding: "16px 24px",
              borderTop: "1px solid #d7e2dc",
              background: "#f2f7f4",
            }}
          >
            <div style={{ fontSize: "12px", color: "#62756f" }}>
              После нажатия Заполнить значения подставятся в строки, а сохранить изменения нужно уже штатной кнопкой Bitrix.
            </div>
            <button
              type="button"
              onClick={props.onClose}
              style={{
                height: "38px",
                padding: "0 16px",
                borderRadius: "8px",
                border: "1px solid #c7d5cf",
                background: "#fff",
                color: "#24433b",
                cursor: "pointer",
                fontWeight: "600",
              }}
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
