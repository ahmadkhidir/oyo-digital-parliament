import { defineConfig, devices } from '@playwright/test';

import { APP_ORIGIN, appEnvironment, runAddress } from './e2e/support/environment';

/**
 * Browser-test configuration for the deployable (ADR-003, `apps/web/AGENTS.md` Checks).
 *
 * One config, two entry points over the same runner:
 *
 * - `pnpm --filter @odp/web test:e2e` runs every flow in `e2e/`, one file per flow in `user-flow.md`.
 * - `pnpm --filter @odp/web test:a11y` runs the flows tagged `@a11y` - the axe scans over every route in
 *   both launch locales (`NFR-044`). A scan is tagged rather than kept in a separate runner so it runs
 *   against the same rendered page as the flow it belongs to.
 *
 * Every flow cites the screen file it exercises in its title, and a public read proves its content with
 * scripting disabled: those files call `test.use({ javaScriptEnabled: false })` rather than the config
 * carrying a second project, because a write flow must still run with scripting on. The base URL is
 * overridable so a deployed environment can be scanned without a local server.
 *
 * The fixture setup (`e2e/global-setup.ts`) starts the SMS capture gateway and prepares the disposable
 * stack; the server boots with the same validated environment plus the capture endpoint, so a
 * one-time code is confirmable end to end (`C-002`, `C-005`, `C-076`). Every browser in the run
 * presents one fresh source address, which keeps the registration cap (`NFR-027`) from counting
 * re-runs against each other.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? APP_ORIGIN;

export default defineConfig({
  testDir: './e2e',
  // Only flow and scan files are specs; the support modules beside them are helpers.
  testMatch: /.*\.spec\.ts$/,
  // A flow that passes here and fails in CI is a flake, not a pass: no retries outside CI, one inside.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    // Every action and navigation is bounded: a control that never becomes actionable must fail
    // with the action's name rather than consume the whole test's budget.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    // Nigeria's launch locale and zone, so a date or a cut-off renders as a resident sees it.
    locale: 'en-NG',
    timezoneId: 'Africa/Lagos',
    extraHTTPHeaders: { 'x-forwarded-for': runAddress() },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Screen recording is deliberately off: it runs a recorder in every page from the moment the
    // context opens, and on a constrained host four recorders starve the browsers badly enough that
    // a server action's redirect never reaches the page. Trace and screenshot still capture a failure.
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The built application, not the dev server: a flow tests what ships. `test:e2e` depends on `build`
    // in the Turborepo pipeline, so the output exists by the time the server starts.
    // The documented start command: its `prestart` assembles the standalone bundle, so the suite
    // exercises exactly what a developer and the container run.
    command: 'pnpm run start',
    url: `${baseURL}/healthz`,
    env: appEnvironment(),
    // A server already listening on the port may have booted with a different environment, and the
    // code capture depends on this one. Start our own and fail loudly if the port is taken.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
