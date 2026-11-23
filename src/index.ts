import { imageCacheKey, imageTtl, jsonCacheKey, rangeTtl } from './cache.ts';
import { toContributionsJson } from './contributions-json.ts';
import { fetchContributions } from './github.ts';
import { fetchRows } from './image.ts';
import { buildLogRecord, deleteExpiredLogs, type RequestMeta, writeLog } from './log.ts';
import { FAVICON_BASE64, TOP_PAGE_HTML } from './pages/top-page.generated.ts';
import { parseRequest } from './params.ts';
import { renderPng } from './render/render.ts';
import { errorResponse, jsonErrorResponse, jsonResponse, textResponse } from './responses.ts';

const FAVICON = Uint8Array.from(atob(FAVICON_BASE64), (c) => c.charCodeAt(0));
const ROBOTS_TXT = 'User-agent: *\nAllow: /\n';
const ONE_DAY = 60 * 60 * 24;

export interface Env {
  GITHUB_API_URL: string;
  GITHUB_TOKEN: string;
  DB: D1Database;
  /** Only set by `cf dev --mode test`: pins the clock for VRT. Empty in production. */
  FIXED_NOW?: string;
}

export interface Context {
  waitUntil: (promise: Promise<unknown>) => void;
  cache: Cache;
  now: Date;
}

interface Routed {
  response: Response;
  meta: RequestMeta;
}

const route = async (request: Request, env: Env, context: Context): Promise<Routed> => {
  const { cache, waitUntil, now } = context;
  const parsed = parseRequest(new URL(request.url), now);

  switch (parsed.kind) {
    case 'top':
      return {
        response: textResponse(TOP_PAGE_HTML, 'text/html; charset=utf-8', `public, max-age=${ONE_DAY}`),
        meta: {},
      };
    case 'robots':
      return {
        response: textResponse(ROBOTS_TXT, 'text/plain; charset=utf-8', `public, max-age=${ONE_DAY}`),
        meta: {},
      };
    case 'favicon':
      return {
        response: new Response(FAVICON, {
          headers: { 'content-type': 'image/x-icon', 'cache-control': `public, max-age=${ONE_DAY * 7}` },
        }),
        meta: {},
      };
    case 'bad_request': {
      const respond = parsed.format === 'json' ? jsonErrorResponse : errorResponse;
      return { response: respond('bad_request', parsed.message), meta: { error: 'bad_request' } };
    }
    case 'json': {
      const meta: RequestMeta = { user: parsed.user, to: parsed.to };

      const key = jsonCacheKey(parsed);
      const hit = await cache.match(key);
      if (hit) return { response: hit, meta: { ...meta, cache: 'hit' } };

      // Same range as the image: the last year, or the year ending on `to`.
      const result = await fetchContributions({
        apiUrl: env.GITHUB_API_URL,
        token: env.GITHUB_TOKEN,
        user: parsed.user,
        to: parsed.to ? `${parsed.to}T23:59:59Z` : undefined,
      });
      meta.cache = 'miss';
      meta.github = { cost: result.rateLimit?.cost ?? 0, rateLimit: result.rateLimit };
      if (!result.ok) {
        return { response: jsonErrorResponse(result.error, result.message), meta: { ...meta, error: result.error } };
      }

      const response = jsonResponse(toContributionsJson(result.calendar), rangeTtl(parsed.to, now));
      waitUntil(cache.put(key, response.clone()));
      return { response, meta };
    }
    case 'image': {
      const meta: RequestMeta = { user: parsed.user, theme: parsed.theme, to: parsed.to, pastYears: parsed.pastYears };

      const key = imageCacheKey(parsed);
      const hit = await cache.match(key);
      if (hit) return { response: hit, meta: { ...meta, cache: 'hit' } };

      const github = { apiUrl: env.GITHUB_API_URL, token: env.GITHUB_TOKEN };
      const result = await fetchRows(parsed, { github, cache, waitUntil, now });
      meta.cache = 'miss';
      meta.github = { cost: result.cost, rateLimit: result.rateLimit };
      if (!result.ok) {
        return { response: errorResponse(result.error, result.message), meta: { ...meta, error: result.error } };
      }

      // Note: the Workers clock only advances on I/O, so this is a coarse measure; use Workers
      // Observability's cpuTimeMs for exact CPU time.
      const started = performance.now();
      const png = await renderPng(result.rows, parsed.theme);
      meta.renderMs = performance.now() - started;
      meta.pngBytes = png.byteLength;

      const response = new Response(png, {
        headers: { 'content-type': 'image/png', 'cache-control': `public, max-age=${imageTtl(parsed, now)}` },
      });
      waitUntil(cache.put(key, response.clone()));
      return { response, meta };
    }
  }
};

/** Serves the request and writes its access log after the response (a failed log write never fails the request). */
export const handle = async (request: Request, env: Env, context: Context): Promise<Response> => {
  const { response, meta } = await route(request, env, context);
  const record = buildLogRecord(request, context.now, response.status, meta);
  context.waitUntil(writeLog(env.DB, record).catch((e: unknown) => console.error('[log] failed to write', e)));
  return response;
};

export default {
  fetch: (request, env, ctx) =>
    handle(request, env as Env, {
      waitUntil: (p) => ctx.waitUntil(p),
      cache: caches.default,
      now: (env as Env).FIXED_NOW ? new Date((env as Env).FIXED_NOW as string) : new Date(),
    }),
  scheduled: async (controller, env) => {
    const deleted = await deleteExpiredLogs((env as Env).DB, new Date(controller.scheduledTime));
    console.info('[log] deleted expired logs', deleted);
  },
} satisfies ExportedHandler;
