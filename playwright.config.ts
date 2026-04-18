/**
 * Playwright configuration — Gate 1 of Phase 12 launch verification.
 *
 * Runs against the production Node server started from `dist/server/entry.mjs`
 * on port 4329. `npm run build` must have already produced `dist/` — the CI
 * workflow (.github/workflows/deploy.yml) orders this correctly.
 *
 * Local workflow:
 *   $ npm run build
 *   $ npm run test:e2e
 *
 * Discipline: headless Chromium only. We don't install extra browsers; the
 * thing we're asserting (zero cross-origin requests) is a property of the
 * built HTML, not a browser-specific quirk. Chromium is enough.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4329;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    // Never follow outbound navigations by accident — we assert request
    // hostnames manually in the spec.
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node dist/server/entry.mjs',
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      HOST: '127.0.0.1',
      PORT: String(PORT),
    },
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
