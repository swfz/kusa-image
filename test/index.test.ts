import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Context, handle } from '../src/index.ts';
import { testEnv } from './env.ts';
import { decodePng } from './png-decode.ts';
import { mockGitHub, requestedVariables } from './github-mock.ts';

const ENV = testEnv();
const NOW = new Date('2026-11-22T00:00:00Z');

let pending: Promise<unknown>[] = [];
let context: Context;
beforeEach(async () => {
  pending = [];
  // A fresh cache per test keeps tests independent.
  context = { cache: await caches.open(crypto.randomUUID()), waitUntil: (p) => pending.push(p), now: NOW };
});

const get = async (path: string, now: Date = NOW) => {
  const res = await handle(new Request(`https://kusa-image.swfz.dev${path}`), ENV, { ...context, now });
  await Promise.all(pending);
  return res;
};
const image = async (res: Response) => decodePng(new Uint8Array(await res.arrayBuffer()));

afterEach(() => vi.restoreAllMocks());

describe('top page and reserved paths', () => {
  it.each(['/', '/?user='])('%s returns the usage page without calling GitHub', async (path) => {
    const spy = mockGitHub();
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('https://kusa-image.swfz.dev/{username}');
    expect(spy).not.toHaveBeenCalled();
  });

  it('serves robots.txt that allows crawling', async () => {
    const spy = mockGitHub();
    const res = await get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await res.text()).toBe('User-agent: *\nAllow: /\n');
    expect(spy).not.toHaveBeenCalled();
  });

  it('serves the favicon', async () => {
    const spy = mockGitHub();
    const res = await get('/favicon.ico');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/x-icon');
    expect(new Uint8Array(await res.arrayBuffer()).subarray(0, 4)).toEqual(new Uint8Array([0, 0, 1, 0]));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('image', () => {
  it.each(['/swfz', '/?user=swfz'])('%s returns a 670x140 PNG', async (path) => {
    mockGitHub();
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await image(res)).toMatchObject({ width: 670, height: 140 });
  });

  it('prefers the user in the path', async () => {
    const spy = mockGitHub();
    await get('/swfz?user=octocat');
    expect(requestedVariables(spy).map((v) => v.user)).toEqual(['swfz']);
  });

  it('sends the token to the GitHub API', async () => {
    const spy = mockGitHub();
    await get('/swfz');
    expect(new Headers(spy.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer test-token');
  });

  it('renders the dark theme', async () => {
    mockGitHub();
    const png = await image(await get('/swfz?theme=dark'));
    expect(png.palette[png.pixels[png.width - 1]]).toEqual([0, 0, 0]);
  });

  it('requests one year ending at to', async () => {
    const spy = mockGitHub();
    const res = await get('/swfz?to=2023-12-31');
    expect(res.status).toBe(200);
    expect(requestedVariables(spy)).toEqual([{ user: 'swfz', to: '2023-12-31T23:59:59Z' }]);
  });

  it('rejects an invalid to with 400 without calling GitHub', async () => {
    const spy = mockGitHub();
    const res = await get('/swfz?to=2023-13-45');
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(spy).not.toHaveBeenCalled();
  });

  it('requests each calendar year for past_years, ignoring to', async () => {
    const spy = mockGitHub();
    const res = await get('/swfz?past_years=3&to=2020-01-01');
    expect(await image(res)).toMatchObject({ width: 670, height: 420 });
    // Requests run in parallel, so compare without depending on their order.
    expect(requestedVariables(spy).toSorted((a, b) => String(a.from).localeCompare(String(b.from)))).toEqual(
      [2024, 2025, 2026].map((y) => ({ user: 'swfz', from: `${y}-01-01T00:00:00Z`, to: `${y}-12-31T23:59:59Z` })),
    );
  });

  it('renders every year since 2008 for past_years beyond the limit', async () => {
    const spy = mockGitHub();
    const res = await get('/swfz?past_years=30');
    expect(await image(res)).toMatchObject({ width: 670, height: 2660 });
    expect(spy).toHaveBeenCalledTimes(19);
  });
});

describe('errors', () => {
  it.each(['/no-such-user-xyz', '/no-such-user-xyz?past_years=3'])('%s returns 404', async (path) => {
    mockGitHub();
    const res = await get(path);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.text()).toBe('Could not resolve to a User. no-such-user-xyz');
  });

  it('returns 503 when rate limited', async () => {
    mockGitHub(() =>
      Response.json({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } }),
    );
    const res = await get('/swfz');
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/rate limit/);
  });

  it('returns 502 when GitHub fails', async () => {
    mockGitHub(() => new Response('Bad Gateway', { status: 502 }));
    const res = await get('/swfz');
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
