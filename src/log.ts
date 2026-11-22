import type { ErrorKind } from './responses.ts';
import type { RateLimit } from './github.ts';

/** Never stored: credentials and client IP addresses. */
export const EXCLUDED_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'cf-connecting-ipv6',
  'true-client-ip',
]);

export const RETENTION_DAYS = 90;

/** What the request handler learned while serving a request. */
export interface RequestMeta {
  user?: string;
  theme?: string;
  to?: string;
  pastYears?: number;
  error?: ErrorKind;
  cache?: 'hit' | 'miss';
  renderMs?: number;
  pngBytes?: number;
  github?: { cost: number; rateLimit: RateLimit | null };
}

export interface LogRecord {
  ts: number;
  method: string;
  url: string;
  headers: Record<string, string>;
  user: string | null;
  theme: string | null;
  to: string | null;
  past_years: number | null;
  status: number;
  error: ErrorKind | null;
  cache: 'hit' | 'miss' | null;
  render_ms: number | null;
  png_bytes: number | null;
  github_cost: number | null;
  github_remaining: number | null;
  github_reset_at: string | null;
  country: string | null;
  colo: string | null;
  asn: number | null;
  http_protocol: string | null;
}

export const sanitizeHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key, value] of headers) if (!EXCLUDED_HEADERS.has(key.toLowerCase())) result[key] = value;
  return result;
};

interface CfProperties {
  country?: string;
  colo?: string;
  asn?: number;
  httpProtocol?: string;
}

export const buildLogRecord = (request: Request, now: Date, status: number, meta: RequestMeta): LogRecord => {
  const cf = (request as { cf?: CfProperties }).cf;
  // Only the GitHub fields exist when GitHub was actually called.
  const github = meta.github?.cost ? meta.github : undefined;
  return {
    ts: Math.floor(now.getTime() / 1000),
    method: request.method,
    url: request.url,
    headers: sanitizeHeaders(request.headers),
    user: meta.user ?? null,
    theme: meta.theme ?? null,
    to: meta.to ?? null,
    past_years: meta.pastYears ?? null,
    status,
    error: meta.error ?? null,
    cache: meta.cache ?? null,
    render_ms: meta.renderMs ?? null,
    png_bytes: meta.pngBytes ?? null,
    github_cost: github?.cost ?? null,
    github_remaining: github?.rateLimit?.remaining ?? null,
    github_reset_at: github?.rateLimit?.resetAt ?? null,
    country: cf?.country ?? null,
    colo: cf?.colo ?? null,
    asn: cf?.asn ?? null,
    http_protocol: cf?.httpProtocol ?? null,
  };
};

export const writeLog = async (db: D1Database, record: LogRecord): Promise<void> => {
  await db
    .prepare('INSERT INTO logs (id, ts, value) VALUES (?, ?, ?)')
    .bind(crypto.randomUUID(), record.ts, JSON.stringify(record))
    .run();
};

/** Deletes logs older than RETENTION_DAYS. Returns the number of deleted rows. */
export const deleteExpiredLogs = async (db: D1Database, now: Date): Promise<number> => {
  const cutoff = Math.floor(now.getTime() / 1000) - RETENTION_DAYS * 24 * 60 * 60;
  const result = await db.prepare('DELETE FROM logs WHERE ts < ?').bind(cutoff).run();
  return result.meta.changes;
};
