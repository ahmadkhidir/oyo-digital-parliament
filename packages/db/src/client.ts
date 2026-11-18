/**
 * The connection pool, the Drizzle client and the transaction boundary.
 *
 * Nothing else in the package constructs a connection (`packages/db/AGENTS.md` Structure). A
 * repository receives an `Executor` — either the shared client or an open transaction — and never
 * opens a transaction of its own, so a write spanning aggregates is composed by the caller in one
 * `withTransaction` call.
 *
 * `withTransaction` refuses to nest. A savepoint would look harmless and would silently make a partial
 * failure invisible to the caller, which is the opposite of what the record needs; a nested call is a
 * composition bug and fails loudly here.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.ts';

/** The typed Drizzle client over the whole schema. */
export type Database = NodePgDatabase<typeof schema>;

/** An open transaction, handed to the work performed inside it. */
export interface TransactionScope {
  readonly tx: Database;
  readonly isTransaction: true;
}

/** Anything that can run a statement: the client, or an open transaction. */
export type Executor = Database | TransactionScope;

/** Options accepted when the process builds its pool. */
export interface DatabaseOptions {
  /** `C-001`-style connection string. Defaults to `DATABASE_URL`. */
  readonly connectionString?: string;
  /** Maximum pooled connections. */
  readonly max?: number;
  /** Recorded in `pg_stat_activity` so a stuck connection is attributable. */
  readonly applicationName?: string;
}

/** A live pool and the client over it. */
export interface DatabaseHandle {
  readonly db: Database;
  readonly pool: Pool;
  /** Closes the pool. Await it when a process or a test finishes. */
  close(): Promise<void>;
}

/** True when a value is an open transaction rather than the shared client. */
export function isTransactionScope(executor: Executor): executor is TransactionScope {
  return (executor as TransactionScope).isTransaction === true;
}

/**
 * Builds a pool and client from an explicit connection string.
 *
 * @throws when no connection string is given and `DATABASE_URL` is unset. A default that pointed at
 * nowhere would turn a configuration error into a confusing connection failure later.
 */
export function createDatabase(options: DatabaseOptions = {}): DatabaseHandle {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === '') {
    throw new Error(
      'DATABASE_URL is required to open the Primary Database; set it or pass connectionString (packages/db/AGENTS.md Checks).',
    );
  }

  const pool = new Pool({
    connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'odp',
  });
  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    close: async () => {
      await pool.end();
    },
  };
}

let shared: DatabaseHandle | undefined;

/** The process-wide handle, created on first use. */
export function getDatabase(): DatabaseHandle {
  shared ??= createDatabase();
  return shared;
}

/** Closes the process-wide handle, if one was created. Used by tests and graceful shutdown. */
export async function closeDatabase(): Promise<void> {
  if (shared === undefined) return;
  const handle = shared;
  shared = undefined;
  await handle.close();
}

const transactionContext = new AsyncLocalStorage<true>();

/**
 * Runs `work` in one database transaction and hands it the transaction scope.
 *
 * Every statement the work issues through the scope commits together or not at all. A failed audit
 * append inside the work therefore rolls the whole change back, which is what `C-001` and `C-090`
 * require. Time and identifiers still arrive from the caller: this helper provides atomicity only.
 *
 * @param work - The statements to run, written against the scope.
 * @param client - The client to open the transaction on; defaults to the process-wide handle. A test
 * harness passes its disposable database so a suite cannot touch the development store.
 * @throws when called inside another `withTransaction` call.
 */
export async function withTransaction<T>(
  work: (scope: TransactionScope) => Promise<T>,
  client?: Database,
): Promise<T> {
  if (transactionContext.getStore() === true) {
    throw new Error(
      'withTransaction was called inside an open transaction: compose repositories through the scope you were given instead of opening a nested transaction (packages/db/AGENTS.md Discipline).',
    );
  }

  const db = client ?? getDatabase().db;
  return db.transaction(async (tx) =>
    transactionContext.run(true, () => work({ tx: tx as Database, isTransaction: true })),
  );
}

/**
 * The Drizzle client to run a statement against.
 *
 * @param executor - An open transaction, the shared client, or nothing for the shared client.
 */
export function executorOf(executor?: Executor): Database {
  if (executor === undefined) return getDatabase().db;
  return isTransactionScope(executor) ? executor.tx : executor;
}
