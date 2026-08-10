export type CatalogAuditResults = {
  emptyCells: HTMLTableCellElement[];
  rowsWithEmpty: HTMLTableRowElement[];
  allEmptyRows: HTMLTableRowElement[];
  validTables: number;
};

export type CatalogPropertyHeader = {
  title: string;
  column: number;
};

type LogicalCell = {
  cell: HTMLTableCellElement;
  start: number;
  end: number;
};

const PRODUCT_ROW_SELECTOR =
  ".main_item_wrapper, [data-product_type], [itemprop='itemListElement']";

function normalizeText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

function normalizeDisplayText(value: string): string {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function getLogicalCells(row: HTMLTableRowElement): LogicalCell[] {
  let column = 0;

  return Array.from(row.cells).map((cell) => {
    const start = column;
    const end = start + Math.max(1, cell.colSpan);
    column = end;
    return { cell, start, end };
  });
}

function findUniqueBoundary(
  cells: LogicalCell[],
  className: string,
  fallback: (text: string) => boolean,
): LogicalCell | null {
  const byClass = cells.filter(({ cell }) => cell.classList.contains(className));
  if (byClass.length === 1) return byClass[0];
  if (byClass.length > 1) return null;

  const byText = cells.filter(({ cell }) => fallback(normalizeText(cell.textContent ?? "")));
  return byText.length === 1 ? byText[0] : null;
}

function findHeaderBounds(
  table: HTMLTableElement,
): { propertyColumns: number[]; propertyHeaders: CatalogPropertyHeader[] } | null {
  const headerRows = Array.from(
    new Set([
      ...Array.from(table.tHead?.rows ?? []),
      ...Array.from(table.querySelectorAll<HTMLTableRowElement>("tr.mainHead")),
      ...Array.from(table.querySelectorAll<HTMLTableRowElement>("tr")).filter((row) =>
        row.querySelector("th"),
      ),
    ]),
  );

  for (const row of headerRows) {
    const cells = getLogicalCells(row);
    const article = findUniqueBoundary(cells, "article", (text) => text.includes("артикул"));
    const price = findUniqueBoundary(cells, "price_item", (text) => text.includes("цена"));

    if (!article || !price || article.end >= price.start) continue;

    const propertyColumns = Array.from(
      { length: price.start - article.end },
      (_, index) => article.end + index,
    );
    const propertyHeaders = cells
      .filter(({ start, end }) => start >= article.end && end <= price.start)
      .map(({ cell, start }) => ({ title: normalizeDisplayText(cell.textContent ?? ""), column: start }))
      .filter((header) => header.title.length > 0);

    if (propertyColumns.length > 0) return { propertyColumns, propertyHeaders };
  }

  return null;
}

function getProductRows(table: HTMLTableElement): HTMLTableRowElement[] {
  const rows = Array.from(table.tBodies).flatMap((body) => Array.from(body.rows));
  const markedRows = rows.filter((row) => row.matches(PRODUCT_ROW_SELECTOR));
  return markedRows.length > 0 ? markedRows : rows.filter((row) => row.cells.length > 1);
}

function mapCellsByColumn(row: HTMLTableRowElement): Map<number, HTMLTableCellElement> {
  const cellsByColumn = new Map<number, HTMLTableCellElement>();

  getLogicalCells(row).forEach(({ cell, start, end }) => {
    for (let column = start; column < end; column += 1) {
      cellsByColumn.set(column, cell);
    }
  });

  return cellsByColumn;
}

export function isEmptyCatalogPropertyCell(cell: HTMLTableCellElement): boolean {
  return normalizeText(cell.textContent ?? "") === "-";
}

export function analyzeCatalogTables(doc: Document): CatalogAuditResults {
  const emptyCells: HTMLTableCellElement[] = [];
  const rowsWithEmpty: HTMLTableRowElement[] = [];
  const allEmptyRows: HTMLTableRowElement[] = [];
  let validTables = 0;

  doc.querySelectorAll<HTMLTableElement>("table.catalog_table").forEach((table) => {
    const bounds = findHeaderBounds(table);
    if (!bounds) return;
    validTables += 1;

    getProductRows(table).forEach((row) => {
      const cellsByColumn = mapCellsByColumn(row);
      const propertyCells = Array.from(
        new Set(
          bounds.propertyColumns
            .map((column) => cellsByColumn.get(column))
            .filter((cell): cell is HTMLTableCellElement => cell !== undefined),
        ),
      );
      if (propertyCells.length === 0) return;

      const missingCells = propertyCells.filter(isEmptyCatalogPropertyCell);
      if (missingCells.length === 0) return;

      emptyCells.push(...missingCells);
      rowsWithEmpty.push(row);

      const hasEveryPropertyColumn = bounds.propertyColumns.every((column) =>
        cellsByColumn.has(column),
      );
      if (hasEveryPropertyColumn && propertyCells.every(isEmptyCatalogPropertyCell)) {
        allEmptyRows.push(row);
      }
    });
  });

  return { emptyCells, rowsWithEmpty, allEmptyRows, validTables };
}

export function getCatalogPropertyHeaders(doc: Document): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();

  doc.querySelectorAll<HTMLTableElement>("table.catalog_table").forEach((table) => {
    const bounds = findHeaderBounds(table);
    if (!bounds) return;

    bounds.propertyHeaders.forEach((header) => {
      const key = normalizeText(header.title);
      if (!key || seen.has(key)) return;
      seen.add(key);
      headers.push(header.title);
    });
  });

  return headers;
}
