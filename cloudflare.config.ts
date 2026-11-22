import { bindings, defineConfig, triggers } from 'cf/config';
import * as entrypoint from './src/index.ts' with { type: 'cf-worker' };

// `cf dev --mode test` points the Worker at the local GitHub mock used by VRT
// and pins the clock so images that depend on the current year stay stable.
const GITHUB_MOCK_URL = 'http://localhost:8000';
const TEST_NOW = '2026-11-22T00:00:00Z';

export default defineConfig(({ mode }) => ({
  worker: {
    name: 'kusa-image',
    compatibilityDate: '2026-11-13',
    entrypoint,
    domains: ['kusa-image.swfz.dev'],
    observability: { enabled: true },
    // Daily cleanup of access logs older than the retention period.
    triggers: [triggers.scheduled({ schedule: '0 3 * * *' })],
    env: {
      GITHUB_API_URL: bindings.text(mode === 'test' ? GITHUB_MOCK_URL : 'https://api.github.com/graphql'),
      FIXED_NOW: bindings.text(mode === 'test' ? TEST_NOW : ''),
      // Personal access token (read-only) used for the GitHub GraphQL API.
      GITHUB_TOKEN: bindings.secret(),
      // Access logs (see migrations/).
      DB: bindings.d1({ name: 'kusa-image', id: '48ce2184-0677-4d39-bfe7-163faf533a4b' }),
    },
  },
}));
