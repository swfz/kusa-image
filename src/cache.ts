import type { ImageRequest } from './image.ts';
import type { JsonRequest } from './params.ts';
import type { ContributionCalendar } from './types.ts';

// Cache API keys live on a private origin so they can never collide with real URLs.
const KEY_ORIGIN = 'https://cache.kusa-image.internal';
const VERSION = 'v1';

/** Images that include today: contributions change during the day. */
export const SHORT_TTL = 60 * 60;
/** Images and calendar years entirely in the past. */
export const LONG_TTL = 60 * 60 * 24 * 7;

/** Same key for requests that render the same image (user is case-insensitive, to is ignored with past_years). */
export const imageCacheKey = (request: ImageRequest): string => {
  const params = new URLSearchParams({ user: request.user.toLowerCase(), theme: request.theme });
  if (request.pastYears) params.set('past_years', String(request.pastYears));
  else if (request.to) params.set('to', request.to);
  return `${KEY_ORIGIN}/${VERSION}/image?${params}`;
};

const today = (now: Date): string => now.toISOString().slice(0, 10);

/** LONG_TTL when a range ending on `to` is entirely in the past, SHORT_TTL when it may include today. */
export const rangeTtl = (to: string | undefined, now: Date): number => (to && to < today(now) ? LONG_TTL : SHORT_TTL);

/** past_years always includes the current year. */
export const imageTtl = (request: ImageRequest, now: Date): number =>
  request.pastYears ? SHORT_TTL : rangeTtl(request.to, now);

/** Same key for the same user (case-insensitive) and to; separate from images. */
export const jsonCacheKey = (request: JsonRequest): string => {
  const params = new URLSearchParams({ user: request.user.toLowerCase() });
  if (request.to) params.set('to', request.to);
  return `${KEY_ORIGIN}/${VERSION}/json?${params}`;
};

export const calendarCacheKey = (user: string, year: number): string =>
  `${KEY_ORIGIN}/${VERSION}/calendar?${new URLSearchParams({ user: user.toLowerCase(), year: String(year) })}`;

export const cachedCalendar = async (cache: Cache, key: string): Promise<ContributionCalendar | undefined> => {
  const hit = await cache.match(key);
  return hit ? ((await hit.json()) as ContributionCalendar) : undefined;
};

export const putCalendar = (cache: Cache, key: string, calendar: ContributionCalendar): Promise<void> =>
  cache.put(key, Response.json(calendar, { headers: { 'cache-control': `public, max-age=${LONG_TTL}` } }));
