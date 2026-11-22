import { env } from 'cloudflare:workers';
import type { Env } from '../src/index.ts';

/** Env for calling handle() directly: the real D1 binding with a mocked GitHub endpoint. */
export const testEnv = (): Env => ({
  GITHUB_API_URL: 'https://api.github.test/graphql',
  GITHUB_TOKEN: 'test-token',
  DB: (env as unknown as { DB: D1Database }).DB,
});
