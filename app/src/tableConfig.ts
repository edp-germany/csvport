type ColumnPresentation = {
  key: string;
  label: string;
};

type TablePresentation = {
  columns?: ColumnPresentation[];
};

const tablePresentation: Record<string, TablePresentation> = {
  eparts: {
    columns: [
      { key: "PART NUMBER", label: "Artikelnummer" },
      { key: "DESIGNATION 1", label: "Bezeichnung" },
      { key: "EAN CODE", label: "EAN" },
      { key: "BRAND", label: "Marke" },
      { key: "STOCK", label: "Bestand" },
      { key: "PRICE", label: "Preis" }
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
