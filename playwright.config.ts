import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './vrt',
  use: { baseURL: 'http://localhost:8787' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    { command: 'node vrt/mock-github.ts', port: 8000, reuseExistingServer: !process.env.CI },
    {
      // Local D1 needs the logs table, or every request logs a write error.
      command: 'cf d1 migrations apply 48ce2184-0677-4d39-bfe7-163faf533a4b --local && cf dev --mode test --port 8787',
      url: 'http://localhost:8787/',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
