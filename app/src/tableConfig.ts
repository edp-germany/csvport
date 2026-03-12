type ColumnPresentation = {
  key: string;
  label: string;
  className?: string;
};

type TablePresentation = {
  columns?: ColumnPresentation[];
};

const tablePresentation: Record<string, TablePresentation> = {
  eparts: {
    columns: [
      { key: "PART NUMBER", label: "Artikelnummer", className: "column-sku" },
      { key: "DESIGNATION 1", label: "Bezeichnung", className: "column-title" },
      { key: "EAN CODE", label: "EAN", className: "column-ean" },
      { key: "BRAND", label: "Marke", className: "column-brand" },
      { key: "STOCK", label: "Bestand", className: "column-stock" },
      { key: "PRICE", label: "Preis", className: "column-price" }
    ]
  }
};

export function getVisibleColumns(
  tableId: string,
  rawColumns: string[]
): ColumnPresentation[] {
  const configuredColumns = tablePresentation[tableId]?.columns;
  if (!configuredColumns || configuredColumns.length === 0) {
    return rawColumns.map((column) => ({ key: column, label: column }));
  }

  return configuredColumns.filter((column) => rawColumns.includes(column.key));
}
