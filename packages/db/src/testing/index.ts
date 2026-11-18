/**
 * The test harness export surface (`packages/db/AGENTS.md` Structure).
 *
 * Tests import it through this file and never construct a pool, read a migration file or write a row
 * template of their own.
 */
export * from './database.ts';
export * from './factories.ts';
