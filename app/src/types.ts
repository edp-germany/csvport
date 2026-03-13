export type TableSummary = {
  id: string;
  label: string;
  rowCount: number;
  updatedAt: string | null;
  ftpModifiedAt: string | null;
  columns: string[];
};

export type TableData = TableSummary & {
  comparisonKey: string | null;
  comparisonBaselineFtpModifiedAt: string | null;
  rowChanges: Record<string, Partial<Record<string, "up" | "down">>>;
  rows: Array<Record<string, string>>;
};
