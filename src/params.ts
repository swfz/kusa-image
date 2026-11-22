import type { Theme } from './types.ts';

export const GITHUB_LAUNCH_YEAR = 2008;

export type ParsedRequest =
  | { kind: 'top' }
  | { kind: 'robots' }
  | { kind: 'favicon' }
  | { kind: 'bad_request'; message: string }
  | { kind: 'image'; user: string; theme: Theme; to?: string; pastYears?: number };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** true when s is a real calendar date in YYYY-MM-DD form. */
export const isValidDate = (s: string): boolean => {
  const m = DATE_PATTERN.exec(s);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === s;
};

/** Number of years shown for past_years: unparsable or < 1 becomes 1, capped at the years since GitHub launched. */
export const normalizePastYears = (value: string, currentYear: number): number => {
  const max = currentYear - GITHUB_LAUNCH_YEAR + 1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(parsed, max);
};

const firstPathSegment = (url: URL): string | undefined => {
  const segment = url.pathname.split('/').find((p) => p.length > 0);
  if (segment === undefined) return undefined;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

export const parseRequest = (url: URL, now: Date): ParsedRequest => {
  const segment = firstPathSegment(url);
  if (segment === 'robots.txt') return { kind: 'robots' };
  if (segment === 'favicon.ico') return { kind: 'favicon' };

  // The path takes precedence over ?user=.
  const user = segment ?? url.searchParams.get('user') ?? '';
  if (user === '') return { kind: 'top' };

  const theme: Theme = url.searchParams.get('theme') === 'dark' ? 'dark' : 'light';

  // An empty past_years is treated as not given, like the previous implementation.
  const pastYears = url.searchParams.get('past_years');
  if (pastYears) {
    return { kind: 'image', user, theme, pastYears: normalizePastYears(pastYears, now.getUTCFullYear()) };
  }

  // An empty to is also treated as not given.
  const to = url.searchParams.get('to');
  if (to) {
    if (!isValidDate(to))
      return { kind: 'bad_request', message: `Invalid "to" parameter: expected YYYY-MM-DD, got ${to}` };
    return { kind: 'image', user, theme, to };
  }

  return { kind: 'image', user, theme };
};
