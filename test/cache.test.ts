import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageCacheKey, imageTtl, LONG_TTL, SHORT_TTL } from '../src/cache.ts';
import { type Context, handle } from '../src/index.ts';
import { testEnv } from './env.ts';
import { parseRequest } from '../src/params.ts';
import { mockGitHub, requestedVariables } from './github-mock.ts';

const ENV = testEnv();
const NOW = new Date('2026-11-22T00:00:00Z');

const imageRequest = (path: string) => {
  const parsed = parseRequest(new URL(path, 'https://kusa-image.swfz.dev'), NOW);
  if (parsed.kind !== 'image') throw new Error(`not an image request: ${path}`);
  return parsed;
};

describe('imageCacheKey', () => {
  it('ignores how the request was written', () => {
    expect(imageCacheKey(imageRequest('/swfz?theme=dark'))).toBe(
      imageCacheKey(imageRequest('/?theme=dark&user=SWFZ&unknown=1')),
    );
  });

  it('uses the normalized past_years and ignores to with it', () => {
    expect(imageCacheKey(imageRequest('/swfz?past_years=30'))).toBe(imageCacheKey(imageRequest('/swfz?past_years=19')));
    expect(imageCacheKey(imageRequest('/swfz?past_years=3&to=2020-01-01'))).toBe(
      imageCacheKey(imageRequest('/swfz?past_years=3')),
    );
  });

  it('separates themes, users, ranges', () => {
    const keys = ['/swfz', '/swfz?theme=dark', '/octocat', '/swfz?to=2023-12-31', '/swfz?past_years=3'].map((p) =>
      imageCacheKey(imageRequest(p)),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('imageTtl', () => {
  it.each([
    ['/swfz', SHORT_TTL],
    ['/swfz?past_years=3', SHORT_TTL],
    ['/swfz?to=2026-11-22', SHORT_TTL], // today
    ['/swfz?to=2027-01-01', SHORT_TTL], // future
    ['/swfz?to=2026-11-21', LONG_TTL], // yesterday
    ['/swfz?to=2023-12-31', LONG_TTL],
  ])('%s -> %i', (path, ttl) => {
    expect(imageTtl(imageRequest(path), NOW)).toBe(ttl);
  });

  it('keeps images including today within an hour and past-only images for at least 7 days', () => {
    expect(SHORT_TTL).toBeLessThanOrEqual(60 * 60);
    expect(LONG_TTL).toBeGreaterThanOrEqual(60 * 60 * 24 * 7);
  });
});

describe('handle with cache', () => {
  let pending: Promise<unknown>[] = [];
  let context: Context;
  beforeEach(async () => {
    pending = [];
    context = { cache: await caches.open(crypto.randomUUID()), waitUntil: (p) => pending.push(p), now: NOW };
  });
  afterEach(() => vi.restoreAllMocks());

  const get = async (path: string) => {
    const res = await handle(new Request(`https://kusa-image.swfz.dev${path}`), ENV, context);
    await Promise.all(pending);
    return res;
  };

  it('serves the second request from the cache, even when written differently', async () => {
    const spy = mockGitHub();
    const first = await get('/swfz?theme=dark');
    const second = await get('/?theme=dark&user=SWFZ');

    expect(spy).toHaveBeenCalledTimes(1);
    expect(second.status).toBe(200);
    expect(new Uint8Array(await second.arrayBuffer())).toEqual(new Uint8Array(await first.arrayBuffer()));
  });

  it('renders a different theme separately', async () => {
    const spy = mockGitHub();
    await get('/swfz');
    await get('/swfz?theme=dark');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('sets Cache-Control max-age to the TTL', async () => {
    mockGitHub();
    expect((await get('/swfz')).headers.get('cache-control')).toBe(`public, max-age=${SHORT_TTL}`);
    expect((await get('/swfz?to=2023-12-31')).headers.get('cache-control')).toBe(`public, max-age=${LONG_TTL}`);
  });

  it('does not cache upstream errors', async () => {
    let failing = true;
    mockGitHub(() => (failing ? new Response('Bad Gateway', { status: 502 }) : undefined));

    const error = await get('/swfz');
    expect(error.status).toBe(502);
    expect(error.headers.get('cache-control')).toBe('no-store');

    failing = false;
    expect((await get('/swfz')).status).toBe(200);
  });

  it('re-fetches only the current year when the multi-year image expires', async () => {
    const spy = mockGitHub();
    await get('/swfz?past_years=14');
    expect(spy).toHaveBeenCalledTimes(14);

    // Simulate the image cache entry expiring while the yearly calendars are still cached.
    await context.cache.delete(imageCacheKey(imageRequest('/swfz?past_years=14')));
    spy.mockClear();

    const res = await get('/swfz?past_years=14');
    expect(res.status).toBe(200);
    expect(requestedVariables(spy).map((v) => v.from)).toEqual(['2026-01-01T00:00:00Z']);
  });
});
