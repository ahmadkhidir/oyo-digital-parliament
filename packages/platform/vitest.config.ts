import { defineConfig } from 'vitest/config';

/**
 * Unit and contract tests (`packages/platform/AGENTS.md` Checks).
 *
 * The default run is offline and covers `src`: configuration, the clock and calendar, identifiers,
 * every adapter against a scripted transport, the doubles, and the shared contract suites. The
 * integration suite lives under `test/` and has its own configuration, so a unit run never touches
 * Redis or the object store.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
