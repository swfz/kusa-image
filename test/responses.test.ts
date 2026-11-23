import { describe, expect, it } from 'vitest';
import { errorResponse, jsonErrorResponse, jsonResponse } from '../src/responses.ts';

describe('jsonErrorResponse', () => {
  it.each([
    ['bad_request', 400],
    ['user_not_found', 404],
    ['upstream_error', 502],
    ['rate_limited', 503],
  ] as const)('%s -> %i with a JSON error body', async (kind, status) => {
    const res = jsonErrorResponse(kind, 'something went wrong');
    expect(res.status).toBe(status);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toEqual({ error: 'something went wrong' });
  });

  it('uses the same status as the image error', () => {
    expect(jsonErrorResponse('rate_limited', 'x').status).toBe(errorResponse('rate_limited', 'x').status);
  });
});

describe('jsonResponse', () => {
  it('returns 200 JSON with max-age and CORS', async () => {
    const res = jsonResponse({ a: 1 }, 3600);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(await res.json()).toEqual({ a: 1 });
  });
});
