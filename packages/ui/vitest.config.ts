import { defineConfig } from 'vitest/config';

/**
 * The single test configuration (`packages/ui/AGENTS.md`, Tests): jsdom for the component
 * suites, the shared setup file, and the automatic JSX transform React 19 expects.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    // jsdom is expensive to start per file on this machine; one per worker keeps per-file
    // isolation (each file still gets a fresh DOM through the setup cleanup).
    pool: 'vmThreads',
    setupFiles: ['./src/test/setup.ts'],
    esbuild: { jsx: 'automatic' },
  },
});
