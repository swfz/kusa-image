import { cachedCalendar, calendarCacheKey, putCalendar } from './cache.ts';
import { type ContributionsResult, fetchContributions, type RateLimit } from './github.ts';
import type { ParsedRequest } from './params.ts';
import type { Row } from './render/render.ts';
import { termOf } from './render/text.ts';

export type ImageRequest = Extract<ParsedRequest, { kind: 'image' }>;

export interface GitHubConfig {
  apiUrl: string;
  token: string;
}

export interface FetchRowsDeps {
  github: GitHubConfig;
  /** Caches calendars of past years (they no longer change). */
  cache: Cache;
  waitUntil: (promise: Promise<unknown>) => void;
  now: Date;
}

export type RowsResult =
  | { ok: true; rows: Row[]; rateLimit: RateLimit | null; cost: number }
  | (Extract<ContributionsResult, { ok: false }> & { cost: number });

/** Years shown for past_years=n: oldest first, ending with the current year. */
export const yearsFor = (pastYears: number, currentYear: number): number[] =>
  Array.from({ length: pastYears }, (_, i) => currentYear - pastYears + 1 + i);

/** Fetches the calendars an image needs and turns them into rows (oldest first). */
export const fetchRows = async (request: ImageRequest, deps: FetchRowsDeps): Promise<RowsResult> => {
  const { github, cache, waitUntil, now } = deps;
  const currentYear = now.getUTCFullYear();
  const fetchRange = (from?: string, to?: string) => fetchContributions({ ...github, user: request.user, from, to });

  // Past years come from the cache when possible; only misses (and the current year) hit GitHub.
  const fetchYear = async (year: number): Promise<ContributionsResult> => {
    const key = calendarCacheKey(request.user, year);
    if (year < currentYear) {
      const calendar = await cachedCalendar(cache, key);
      if (calendar) return { ok: true, calendar, rateLimit: null };
    }
    const result = await fetchRange(`${year}-01-01T00:00:00Z`, `${year}-12-31T23:59:59Z`);
    if (result.ok && year < currentYear) waitUntil(putCalendar(cache, key, result.calendar));
    return result;
  };

  const years = request.pastYears ? yearsFor(request.pastYears, currentYear) : undefined;
  const results = await Promise.all(
    years ? years.map(fetchYear) : [fetchRange(undefined, request.to ? `${request.to}T23:59:59Z` : undefined)],
  );
  const cost = results.reduce((sum, r) => sum + (r.rateLimit?.cost ?? 0), 0);
  const rateLimit = results.findLast((r) => r.rateLimit)?.rateLimit ?? null;

  const failed = results.find((r) => !r.ok);
  if (failed && !failed.ok) return { ...failed, cost };

  const rows = results.map((r, i): Row => {
    if (!r.ok) throw new Error('unreachable');
    const term = years ? years[i] : request.to ? termOf(r.calendar) : undefined;
    return { calendar: r.calendar, term };
  });
  return { ok: true, rows, rateLimit, cost };
};
