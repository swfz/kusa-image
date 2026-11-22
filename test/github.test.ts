import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchContributions } from '../src/github.ts';
import { calendarFixture, graphqlFixture } from './fixtures.ts';

const API_URL = 'https://api.github.test/graphql';

// Build a new Response per call: Workers forbids reading a body created in another request context.
const mockFetch = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json(body, { status, headers }));

const call = (user = 'swfz', range: { from?: string; to?: string } = {}) =>
  fetchContributions({ apiUrl: API_URL, token: 'test-token', user, ...range });

afterEach(() => vi.restoreAllMocks());

describe('fetchContributions', () => {
  it('returns the calendar and rate limit on success', async () => {
    const spy = mockFetch(200, graphqlFixture('default'));

    const result = await call('swfz', { to: '2023-12-31T23:59:59Z' });

    expect(result).toEqual({
      ok: true,
      calendar: calendarFixture('default'),
      rateLimit: graphqlFixture('default').data.rateLimit,
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(API_URL);
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token');
    expect(JSON.parse(String(init?.body)).variables).toEqual({ user: 'swfz', to: '2023-12-31T23:59:59Z' });
  });

  it('extracts cost, remaining and resetAt', async () => {
    mockFetch(200, graphqlFixture('year-2026'));
    const result = await call();
    expect(result.rateLimit).toEqual({ cost: 1, remaining: 4976, resetAt: '2026-11-22T03:52:06Z' });
  });

  it('classifies a missing user as user_not_found', async () => {
    mockFetch(200, graphqlFixture('not-found'));
    expect(await call('no-such-user-xyz-kusa')).toMatchObject({
      ok: false,
      error: 'user_not_found',
      message: 'Could not resolve to a User. no-such-user-xyz-kusa',
    });
  });

  it.each([
    [
      'HTTP 403 with x-ratelimit-remaining: 0',
      403,
      { message: 'API rate limit exceeded' },
      { 'x-ratelimit-remaining': '0' },
    ],
    ['HTTP 429', 429, {}, {}],
    ['GraphQL RATE_LIMITED error', 200, { data: null, errors: [{ type: 'RATE_LIMITED', message: 'limit' }] }, {}],
  ])('classifies %s as rate_limited', async (_name, status, body, headers) => {
    mockFetch(status, body, headers);
    expect(await call()).toMatchObject({ ok: false, error: 'rate_limited' });
  });

  it.each([
    ['HTTP 502', 502, { message: 'Bad Gateway' }],
    ['HTTP 401 (bad token)', 401, { message: 'Bad credentials' }],
    ['an unexpected body', 200, { data: { user: {} } }],
  ])('classifies %s as upstream_error', async (_name, status, body) => {
    mockFetch(status, body);
    expect(await call()).toMatchObject({ ok: false, error: 'upstream_error' });
  });

  it('classifies a network failure as upstream_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network connection lost.'));
    expect(await call()).toMatchObject({ ok: false, error: 'upstream_error', rateLimit: null });
  });

  it('classifies a non-JSON body as upstream_error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('<html>oops</html>', { status: 500 }));
    expect(await call()).toMatchObject({ ok: false, error: 'upstream_error' });
  });
});
