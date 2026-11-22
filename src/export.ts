// Converts D1 log rows into the JSON Lines format loaded into BigQuery (kusa_image.logs):
//   key:JSON, value:JSON, versionstamp:STRING, ts:TIMESTAMP
// The key mirrors the former Deno KV key: ["kusa-image", "logs", year, month, day, id].

export interface LogRow {
  id: string;
  ts: number;
  value: string;
}

export interface ExportLine {
  key: [string, string, number, number, number, string];
  value: Record<string, unknown>;
  versionstamp: null;
  ts: string;
}

/** [start, end) unix seconds of a UTC month. */
export const monthRange = (year: number, month: number): [number, number] => [
  Date.UTC(year, month - 1, 1) / 1000,
  Date.UTC(year, month, 1) / 1000,
];

export const toExportLine = (row: LogRow): ExportLine => {
  const date = new Date(row.ts * 1000);
  return {
    key: ['kusa-image', 'logs', date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), row.id],
    value: JSON.parse(row.value),
    versionstamp: null,
    ts: date.toISOString(),
  };
};

export const toJsonLines = (rows: LogRow[]): string => rows.map((r) => `${JSON.stringify(toExportLine(r))}\n`).join('');
