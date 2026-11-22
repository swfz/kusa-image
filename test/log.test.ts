import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Context, handle } from '../src/index.ts';
import { buildLogRecord, deleteExpiredLogs, EXCLUDED_HEADERS, type LogRecord } from '../src/log.ts';
import { testEnv } from './env.ts';
import { mockGitHub } from './github-mock.ts';

const NOW = new Date('2026-11-22T00:00:00Z');
const ENV = testEnv();

let pending: Promise<unknown>[];
let context: Context;
beforeEach(async () => {
  pending = [];
  context = { cache: await caches.open(crypto.randomUUID()), waitUntil: (p) => pending.push(p), now: NOW };
  await ENV.DB.exec('DELETE FROM logs');
});
afterEach(() => vi.restoreAllMocks());

const request = (path: string, init: RequestInit & { cf?: Record<string, unknown> } = {}) =>
  new Request(`https://kusa-image.swfz.dev${path}`, init);

const serve = async (req: Request, env = ENV) => {
  const res = await handle(req, env, context);
  await Promise.all(pending);
  return res;
};

const logs = async (): Promise<LogRecord[]> => {
  const { results } = await ENV.DB.prepare('SELECT value FROM logs ORDER BY ts').all<{ value: string }>();
  return results.map((r) => JSON.parse(r.value));
};

describe('access log', () => {
  it('records one row per request, including the top page and errors', async () => {
    mockGitHub();
    await serve(request('/'));
    await serve(request('/robots.txt'));
    await serve(request('/no-such-user-xyz'));
    await serve(request('/swfz?to=bad'));
    expect((await logs()).map((l) => [l.url, l.status, l.error])).toEqual([
      ['https://kusa-image.swfz.dev/', 200, null],
      ['https://kusa-image.swfz.dev/robots.txt', 200, null],
      ['https://kusa-image.swfz.dev/no-such-user-xyz', 404, 'user_not_found'],
      ['https://kusa-image.swfz.dev/swfz?to=bad', 400, 'bad_request'],
    ]);
  });

  it('records the request, the parsed parameters and the rendering result', async () => {
    mockGitHub();
    await serve(
      request('/swfz?theme=dark&past_years=3', {
        headers: { 'user-agent': 'Slackbot 1.0', referer: 'https://example.com/' },
      }),
    );
    const [log] = await logs();
    expect(log).toMatchObject({
      ts: NOW.getTime() / 1000,
      method: 'GET',
      url: 'https://kusa-image.swfz.dev/swfz?theme=dark&past_years=3',
      headers: { 'user-agent': 'Slackbot 1.0', referer: 'https://example.com/' },
      user: 'swfz',
      theme: 'dark',
      past_years: 3,
      to: null,
      status: 200,
      error: null,
      cache: 'miss',
      github_cost: 3,
      github_remaining: expect.any(Number),
      github_reset_at: expect.any(String),
    });
    expect(log.png_bytes).toBeGreaterThan(0);
    expect(log.render_ms).toEqual(expect.any(Number));
  });

  it('records a cache hit without rendering or GitHub fields', async () => {
    mockGitHub();
    await serve(request('/swfz'));
    await serve(request('/swfz'));
    const [, hit] = await logs();
    expect(hit).toMatchObject({
      cache: 'hit',
      render_ms: null,
      png_bytes: null,
      github_cost: null,
      github_remaining: null,
      github_reset_at: null,
    });
  });

  it('records rate limiting as 503 / rate_limited', async () => {
    mockGitHub(() => Response.json({ message: 'API rate limit exceeded' }, { status: 429 }));
    await serve(request('/swfz'));
    expect(await logs()).toMatchObject([{ status: 503, error: 'rate_limited' }]);
  });

  it('never stores credentials or client IP addresses', async () => {
    mockGitHub();
    const secrets = Object.fromEntries([...EXCLUDED_HEADERS].map((h) => [h, `secret-${h}`]));
    await serve(request('/swfz', { headers: { ...secrets, 'user-agent': 'test' } }));
    const [log] = await logs();
    const stored = JSON.stringify(log);
    for (const value of Object.values(secrets)) expect(stored).not.toContain(value);
    expect(log.headers['user-agent']).toBe('test');
  });

  it('still serves the image when writing the log fails', async () => {
    mockGitHub();
    const brokenDb = {
      prepare: () => {
        throw new Error('D1 is unavailable');
      },
    } as unknown as D1Database;
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await serve(request('/swfz'), { ...ENV, DB: brokenDb });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  });
});

describe('buildLogRecord', () => {
  it('copies the edge attributes from request.cf', () => {
    const req = {
      method: 'GET',
      url: 'https://kusa-image.swfz.dev/',
      headers: new Headers(),
      cf: { country: 'JP', colo: 'NRT', asn: 2516, httpProtocol: 'HTTP/2' },
    } as unknown as Request;
    expect(buildLogRecord(req, NOW, 200, {})).toMatchObject({
      country: 'JP',
      colo: 'NRT',
      asn: 2516,
      http_protocol: 'HTTP/2',
    });
  });
});

describe('deleteExpiredLogs', () => {
  it('keeps logs from the last 90 days and deletes older ones', async () => {
    const daysAgo = (days: number) => Math.floor(NOW.getTime() / 1000) - days * 24 * 60 * 60;
    const insert = (id: string, ts: number) =>
      ENV.DB.prepare('INSERT INTO logs (id, ts, value) VALUES (?, ?, ?)').bind(id, ts, '{}').run();
    await insert('recent', daysAgo(1));
    await insert('89-days', daysAgo(89));
    await insert('91-days', daysAgo(91));

    expect(await deleteExpiredLogs(ENV.DB, NOW)).toBe(1);

    const { results } = await ENV.DB.prepare('SELECT id FROM logs ORDER BY ts DESC').all<{ id: string }>();
    expect(results.map((r) => r.id)).toEqual(['recent', '89-days']);
  });
});
