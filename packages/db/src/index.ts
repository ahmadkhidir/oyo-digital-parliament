/**
 * The public surface of `@odp/db`.
 *
 * Repository constructors, the transaction helper and the idempotency helpers (`packages/db/AGENTS.md`
 * Structure). Entity modules stay internal; `package.json` exposes the schema barrel separately for
 * drizzle-kit and the test harness.
 */
export {
  closeDatabase,
  createDatabase,
  executorOf,
  getDatabase,
  isTransactionScope,
  withTransaction,
  type Database,
  type DatabaseHandle,
  type DatabaseOptions,
  type Executor,
  type TransactionScope,
} from './client.ts';
export * from './repositories/index.ts';
export * from './idempotency/index.ts';
export * from './search/index.ts';
