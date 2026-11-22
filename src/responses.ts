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

export const textResponse = (body: string, contentType: string, cacheControl: string): Response =>
  new Response(body, { headers: { 'content-type': contentType, 'cache-control': cacheControl } });
