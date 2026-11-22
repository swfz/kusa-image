// Exports one month of access logs from D1 as JSON Lines for BigQuery.
//
//   node scripts/export-logs.ts <year> <month> > 2027-01-cf.jsonl
//
// Requires CLOUDFLARE_API_TOKEN (D1 read), CLOUDFLARE_ACCOUNT_ID and D1_DATABASE_ID.
import { type LogRow, monthRange, toJsonLines } from '../src/export.ts';

const PAGE_SIZE = 5000;

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const query = async (sql: string, params: (string | number)[]): Promise<LogRow[]> => {
  const url = `https://api.cloudflare.com/client/v4/accounts/${requireEnv('CLOUDFLARE_ACCOUNT_ID')}/d1/database/${requireEnv('D1_DATABASE_ID')}/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${requireEnv('CLOUDFLARE_API_TOKEN')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sql, params }),
  });
  const body = (await res.json()) as { success: boolean; errors?: unknown[]; result?: { results: LogRow[] }[] };
  if (!res.ok || !body.success || !body.result) throw new Error(`D1 query failed: ${JSON.stringify(body.errors)}`);
  return body.result[0].results;
};

const [year, month] = process.argv.slice(2).map(Number);
if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
  console.error('usage: node scripts/export-logs.ts <year> <month>');
  process.exit(1);
}

const [start, end] = monthRange(year, month);
for (let offset = 0; ; offset += PAGE_SIZE) {
  const rows = await query('SELECT id, ts, value FROM logs WHERE ts >= ? AND ts < ? ORDER BY ts, id LIMIT ? OFFSET ?', [
    start,
    end,
    PAGE_SIZE,
    offset,
  ]);
  process.stdout.write(toJsonLines(rows));
  if (rows.length < PAGE_SIZE) break;
}
