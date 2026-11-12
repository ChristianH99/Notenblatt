import { defineConfig } from '@playwright/test';

/** Website screenshots only (npm run site:screenshots); not part of the test suite. */
export default defineConfig({
  testDir: 'tests/site',
  timeout: 300_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results/site',
});
