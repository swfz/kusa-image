import type { GitHubErrorKind } from './github.ts';

export type ErrorKind = GitHubErrorKind | 'bad_request';

const ERROR_STATUS: Record<ErrorKind, number> = {
  bad_request: 400,
  user_not_found: 404,
  upstream_error: 502,
  rate_limited: 503,
};

export const errorResponse = (kind: ErrorKind, message: string): Response =>
  new Response(message, {
    status: ERROR_STATUS[kind],
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });

const CORS = { 'access-control-allow-origin': '*' };
const JSON_TYPE = 'application/json; charset=utf-8';

/** Errors for /<user>.json: the same statuses as images, with a { error } body like deno-github-contributions-api. */
export const jsonErrorResponse = (kind: ErrorKind, message: string): Response =>
  new Response(JSON.stringify({ error: message }), {
    status: ERROR_STATUS[kind],
    headers: { 'content-type': JSON_TYPE, 'cache-control': 'no-store', ...CORS },
  });

export const jsonResponse = (body: unknown, maxAge: number): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'content-type': JSON_TYPE, 'cache-control': `public, max-age=${maxAge}`, ...CORS },
  });

export const textResponse = (body: string, contentType: string, cacheControl: string): Response =>
  new Response(body, { headers: { 'content-type': contentType, 'cache-control': cacheControl } });
