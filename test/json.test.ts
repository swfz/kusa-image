import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContributionsJson } from '../src/contributions-json.ts';
import { type Context, handle } from '../src/index.ts';
import type { LogRecord } from '../src/log.ts';
import { testEnv } from './env.ts';
import { graphqlFixture } from './fixtures.ts';
import { mockGitHub, requestedVariables } from './github-mock.ts';

const ENV = testEnv();
const NOW = new Date('2026-11-22T00:00:00Z');

let pending: Promise<unknown>[] = [];
let context: Context;
beforeEach(async () => {
  pending = [];
  context = { cache: await caches.open(crypto.randomUUID()), waitUntil: (p) => pending.push(p), now: NOW };
  await ENV.DB.exec('DELETE FROM logs');
});
afterEach(() => vi.restoreAllMocks());

const get = async (path: string) => {
  const res = await handle(new Request(`https://kusa-image.swfz.dev${path}`), ENV, context);
  await Promise.all(pending);
  return res;
};
const body = async (res: Response) => (await res.json()) as ContributionsJson;
const maxAge = (res: Response) => Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1]);
const logs = async (): Promise<LogRecord[]> => {
  const { results } = await ENV.DB.prepare('SELECT value FROM logs ORDER BY ts').all<{ value: string }>();
  return results.map((r) => JSON.parse(r.value));
};

/** The default fixture with a rateLimit, so the log has a GitHub cost. */
const withRateLimit = (cost: number) => ({
  ...graphqlFixture('default'),
  data: { ...graphqlFixture('default').data, rateLimit: { cost, remaining: 4999, resetAt: '2026-11-22T01:00:00Z' } },
});

describe('GET /<user>.json', () => {
  it('returns the last year as JSON compatible with deno-github-contributions-api', async () => {
    const spy = mockGitHub();
    const res = await get('/swfz.json');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');

    const json = await body(res);
    expect(json.totalContributions).toBe(4673);
    expect(json.contributions.flat().at(-1)?.date).toBe('2026-11-22');
    for (const day of json.contributions.flat()) {
      expect(Object.keys(day)).toEqual(['contributionCount', 'contributionLevel', 'date']);
    }
    expect(requestedVariables(spy)).toEqual([{ user: 'swfz' }]);
  });

  it('requests one year ending at to', async () => {
    const spy = mockGitHub();
    const res = await get('/swfz.json?to=2023-12-31');
    expect(res.status).toBe(200);
    expect(requestedVariables(spy)).toEqual([{ user: 'swfz', to: '2023-12-31T23:59:59Z' }]);
  });

  it('accepts an uppercase user', async () => {
    mockGitHub();
    const res = await get('/SWFZ.json');
    expect(res.status).toBe(200);
    expect((await body(res)).totalContributions).toBe(4673);
  });

  it.each(['past_years=3', 'theme=dark', 'user=octocat'])('ignores %s', async (query) => {
    const spy = mockGitHub();
    const res = await get(`/swfz.json?${query}`);
    expect(res.status).toBe(200);
    expect(requestedVariables(spy)).toEqual([{ user: 'swfz' }]);
  });

  it('returns JSON, not the PNG, right after the image of the same user', async () => {
    mockGitHub();
    await get('/swfz');
    const res = await get('/swfz.json');
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect((await body(res)).totalContributions).toBe(4673);
  });
});

/** Checks the shared error shape and returns the body. */
const expectJsonError = async (res: Response, status: number) => {
  expect(res.status).toBe(status);
  expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('access-control-allow-origin')).toBe('*');
  return (await res.json()) as { error: string };
};

describe('GET /<user>.json errors', () => {
  it('returns 404 for an unknown user', async () => {
    mockGitHub();
    const json = await expectJsonError(await get('/no-such-user-xyz.json'), 404);
    expect(json).toEqual({ error: 'Could not resolve to a User. no-such-user-xyz' });
  });

  it.each(['/swfz.json?to=2023-13-45', '/.json'])('%s returns 400 without calling GitHub', async (path) => {
    const spy = mockGitHub();
    await expectJsonError(await get(path), 400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns 503 when rate limited', async () => {
    mockGitHub(() =>
      Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    );
    const json = await expectJsonError(await get('/swfz.json'), 503);
    expect(json.error).toMatch(/rate limit/);
  });

  it('returns 502 when GitHub fails', async () => {
    mockGitHub(() => new Response('Bad Gateway', { status: 502 }));
    const json = await expectJsonError(await get('/swfz.json'), 502);
    expect(json.error).toMatch(/502/);
  });

  it('does not cache errors', async () => {
    let fail = true;
    const spy = mockGitHub(() => (fail ? new Response('Bad Gateway', { status: 502 }) : undefined));
    expect((await get('/swfz.json')).status).toBe(502);
    fail = false;
    expect((await get('/swfz.json')).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe('GET /<user>.json cache', () => {
  it('serves the same user and to from the cache', async () => {
    const spy = mockGitHub();
    const first = await get('/swfz.json?to=2023-12-31');
    const second = await get('/SWFZ.json?to=2023-12-31&theme=dark');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await second.json()).toEqual(await first.json());
  });

  it('keeps ranges including today within an hour', async () => {
    mockGitHub();
    expect(maxAge(await get('/swfz.json'))).toBeLessThanOrEqual(3600);
    expect(maxAge(await get('/swfz.json?to=2026-11-22'))).toBeLessThanOrEqual(3600);
  });

  it('keeps past-only ranges for at least 7 days', async () => {
    mockGitHub();
    expect(maxAge(await get('/swfz.json?to=2023-12-31'))).toBeGreaterThanOrEqual(604800);
  });
});

describe('GET /<user>.json access log', () => {
  it('records the user, to, cache and GitHub cost, with image fields null', async () => {
    mockGitHub(() => Response.json(withRateLimit(1)));
    await get('/swfz.json?to=2023-12-31');
    await get('/swfz.json?to=2023-12-31');

    const [miss, hit] = await logs();
    expect(miss).toMatchObject({
      url: 'https://kusa-image.swfz.dev/swfz.json?to=2023-12-31',
      status: 200,
      user: 'swfz',
      to: '2023-12-31',
      cache: 'miss',
      github_cost: 1,
      github_remaining: 4999,
      theme: null,
      past_years: null,
      render_ms: null,
      png_bytes: null,
    });
    expect(hit).toMatchObject({ cache: 'hit', github_cost: null });
  });

  it('records errors', async () => {
    mockGitHub();
    await get('/no-such-user-xyz.json');
    expect((await logs()).map((l) => [l.status, l.error])).toEqual([[404, 'user_not_found']]);
  });
});
