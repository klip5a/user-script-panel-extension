import type { ComponentParamsMatrixColumn, ComponentParamsMatrixRow } from "../model/types";

type Props = {
  open: boolean;
  title: string;
  columns: ComponentParamsMatrixColumn[];
  rows: ComponentParamsMatrixRow[];
  search: string;
  onClose: () => void;
  onSearchChange: (value: string) => void;
};

function matchesSearch(row: ComponentParamsMatrixRow, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase().trim();
  return row.label.toLowerCase().includes(normalized) || row.propertyId.toLowerCase().includes(normalized);
}

export function ComponentParamsVisibilityApp(props: Props) {
  if (!props.open) return null;

  const filteredRows = props.rows.filter((row) => matchesSearch(row, props.search));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "rgba(17, 24, 39, 0.42)",
      }}
    >
      <div
        style={{
          width: "min(1480px, 100%)",
          height: "min(88vh, 980px)",
          background: "#f7faf8",
          border: "1px solid #cfd8d2",
          borderRadius: "12px",
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.28)",
          overflow: "hidden",
          display: "grid",
          gridTemplateRows: "auto auto 1fr auto",
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            padding: "18px 22px",
            borderBottom: "1px solid #d9e3de",
            background: "linear-gradient(180deg, #ffffff 0%, #f1f5f3 100%)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "20px", lineHeight: 1.2, fontWeight: 700, color: "#203631" }}>
              Настройка списка свойств
            </div>
            <div style={{ marginTop: "6px", fontSize: "13px", color: "#60716c" }}>{props.title}</div>
          </div>

          <button
            type="button"
            className="ui-btn ui-btn-light-border"
            onClick={props.onClose}
            style={{ whiteSpace: "nowrap", flexShrink: 0 }}
          >
            Закрыть
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            padding: "14px 22px",
            borderBottom: "1px solid #d9e3de",
            background: "#fbfcfb",
          }}
        >
          <input
            type="text"
            value={props.search}
            onInput={(event) => props.onSearchChange((event.currentTarget as HTMLInputElement).value)}
            placeholder="Поиск по свойствам"
            style={{
              width: "min(420px, 100%)",
              boxSizing: "border-box",
              minHeight: "38px",
              border: "1px solid #cfd8d2",
              borderRadius: "8px",
              padding: "8px 12px",
              background: "#fff",
              color: "#203631",
              fontSize: "14px",
            }}
          />

          <div style={{ fontSize: "13px", color: "#60716c" }}>
            Свойств: {filteredRows.length} из {props.rows.length}
          </div>
        </div>

        <div style={{ minHeight: 0, overflow: "auto", background: "#fff" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              tableLayout: "fixed",
              minWidth: `${420 + props.columns.length * 180}px`,
            }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: "#f4f8f6",
              }}
            >
              <tr>
                <th
                  style={{
                    padding: "14px 16px",
                    borderBottom: "1px solid #d9e3de",
                    borderRight: "1px solid #e7eeea",
                    textAlign: "left",
                    fontSize: "13px",
                    fontWeight: 700,
                    color: "#35574d",
                    width: "420px",
                    background: "#f4f8f6",
                  }}
                >
                  Свойство
                </th>

                {props.columns.map((column) => (
                  <th
                    key={column.key}
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #d9e3de",
                      borderRight: "1px solid #e7eeea",
                      textAlign: "center",
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#35574d",
                      width: "180px",
                      background: "#f4f8f6",
                    }}
                  >
                    {column.title}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={props.columns.length + 1}
                    style={{
                      padding: "28px 20px",
                      textAlign: "center",
                      color: "#71807a",
                      fontSize: "14px",
                    }}
                  >
                    Ничего не найдено.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, rowIndex) => (
                  <tr key={row.key} style={{ background: rowIndex % 2 === 0 ? "#fff" : "#fbfdfc" }}>
                    <td
                      style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #edf2ef",
                        borderRight: "1px solid #edf2ef",
                        verticalAlign: "top",
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 600, lineHeight: 1.35, color: "#203631" }}>
                        {row.label}
                      </div>
                      <div style={{ marginTop: "4px", fontSize: "12px", lineHeight: 1.4, color: "#71807a" }}>
                        {row.propertyId}
                      </div>
                    </td>

                    {props.columns.map((column) => {
                      const checked = row.cells[column.key];
                      return (
                        <td
                          key={column.key}
                          style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid #edf2ef",
                            borderRight: "1px solid #edf2ef",
                            textAlign: "center",
                            verticalAlign: "middle",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            readOnly
                            aria-label={`${row.label} в ${column.title}`}
                            style={{
                              width: "16px",
                              height: "16px",
                              accentColor: "#2f6fed",
                              opacity: checked ? "1" : "0.72",
                              cursor: "pointer",
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div
          style={{
            padding: "14px 22px",
            borderTop: "1px solid #d9e3de",
            background: "#fbfcfb",
            fontSize: "13px",
            color: "#60716c",
          }}
        >
          Список свойств берется из блока списка, а чекбокс показывает, выбрано ли свойство в соответствующем списке Bitrix.
        </div>
      </div>
    </div>
  );
}
