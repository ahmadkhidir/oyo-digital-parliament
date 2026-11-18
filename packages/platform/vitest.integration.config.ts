import { defineConfig } from 'vitest/config';

/**
 * Integration tests against the disposable local stack (`packages/platform/AGENTS.md` Checks).
 *
 * The suite reads the repository's `.env` when it exists and skips the cases whose service is not
 * configured, so `pnpm test:integration` is safe on a machine without Docker and meaningful in CI
 * where the Compose stack is up. No test touches a shared environment.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    setupFiles: ['test/setup.ts'],
  },
});
