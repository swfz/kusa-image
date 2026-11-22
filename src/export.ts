// Converts D1 log rows into the JSON Lines format loaded into BigQuery (kusa_image.cf_logs):
//   id:STRING, ts:TIMESTAMP, value:JSON

export interface LogRow {
  id: string;
  ts: number;
  value: string;
}

export interface ExportLine {
  id: string;
  ts: string;
  value: Record<string, unknown>;
}

/** [start, end) unix seconds of a UTC month. */
export const monthRange = (year: number, month: number): [number, number] => [
  Date.UTC(year, month - 1, 1) / 1000,
  Date.UTC(year, month, 1) / 1000,
];

export const toExportLine = (row: LogRow): ExportLine => ({
  id: row.id,
  ts: new Date(row.ts * 1000).toISOString(),
  value: JSON.parse(row.value),
});

export const toJsonLines = (rows: LogRow[]): string => rows.map((r) => `${JSON.stringify(toExportLine(r))}\n`).join('');
