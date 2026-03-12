export type TableSummary = {
  id: string;
  label: string;
  rowCount: number;
  updatedAt: string | null;
  ftpModifiedAt: string | null;
  columns: string[];
};

export type TableData = TableSummary & {
  rows: Array<Record<string, string>>;
};
