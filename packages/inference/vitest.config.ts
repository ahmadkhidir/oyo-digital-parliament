import { defineConfig } from 'vitest/config';

/**
 * Inference tests (`packages/inference/AGENTS.md` Checks).
 *
 * Every suite runs offline: the provider is replaced by a recorded response or an injected fetch
 * double, so no test reaches a real endpoint. `eval` is included because its scoring definition is
 * part of the judged bar and drifts from the capability if it is not asserted.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'eval/**/*.test.ts'],
    environment: 'node',
  },
});
