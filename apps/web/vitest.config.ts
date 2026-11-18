import { defineConfig } from 'vitest/config';

/**
 * The web area's test configuration. jsdom for the whole suite: the routes' unit and component
 * tests render through Testing Library, and the pure modules they sit beside run unharmed in the
 * same environment. One jsdom per worker keeps per-file isolation without a per-file cost
 * (packages/ui/vitest.config.ts made the same trade under load).
 *
 * The JSX transform is declared here rather than in tsconfig, because Next's tsconfig keeps
 * `jsx: "preserve"` for its own compiler; the Vite bundler (rolldown) transforms through oxc, so
 * the `oxc` block is the one it honours.
 */
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'jsdom',
    pool: 'vmThreads',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30_000,
  },
});
