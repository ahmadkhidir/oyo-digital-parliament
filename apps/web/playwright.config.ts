import { defineConfig, devices } from '@playwright/test';

/**
 * Browser-test configuration for the deployable (ADR-003, `apps/web/AGENTS.md` Checks).
 *
 * One config, two entry points over the same runner:
 *
 * - `pnpm --filter @odp/web test:e2e` runs every flow in `e2e/`, one file per flow in `user-flow.md`.
 * - `pnpm --filter @odp/web test:a11y` runs the flows tagged `@a11y` — the axe scans over every route in
 *   both launch locales (`NFR-044`). A scan is tagged rather than kept in a separate runner so it runs
 *   against the same rendered page as the flow it belongs to.
 *
 * Every flow cites the screen file it exercises in its title, and a public read proves its content with
 * scripting disabled: those files call `test.use({ javaScriptEnabled: false })` rather than the config
 * carrying a second project, because a write flow must still run with scripting on. The base URL is
 * overridable so a deployed environment can be scanned without a local server.
 *
 * The gate owns the flows themselves; this file only wires the runner (ADR-003).
 */
const PORT = 3000;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  // A flow that passes here and fails in CI is a flake, not a pass: no retries outside CI, one inside.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // Nigeria's launch locale and zone, so a date or a cut-off renders as a resident sees it.
    locale: 'en-NG',
    timezoneId: 'Africa/Lagos',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The built application, not the dev server: a flow tests what ships. `test:e2e` depends on `build`
    // in the Turborepo pipeline, so the output exists by the time the server starts.
    command: 'pnpm run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
