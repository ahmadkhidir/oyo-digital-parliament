/**
 * Vitest configuration for `packages/db` (ADR-003, `packages/db/AGENTS.md` Structure).
 *
 * Database suites run against a disposable PostgreSQL database created per worker by `src/testing/`,
 * so files may run in parallel without sharing a schema. Timeouts are raised because creating and
 * migrating a database is slower than a normal unit test, not because any test waits on a clock.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Creating and migrating a disposable database is real DDL work, not a wait on a clock.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // Two workers keep the suite honest about isolation without eight simultaneous CREATE DATABASE
    // and migration runs against one PostgreSQL server, which is slower than the work itself.
    maxWorkers: 2,
  },
});
