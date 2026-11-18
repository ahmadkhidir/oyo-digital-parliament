/**
 * The disposable-database harness (`packages/db/AGENTS.md` Checks).
 *
 * Every suite that needs PostgreSQL creates its own database on the server `DATABASE_URL` names,
 * applies the committed migrations to it, and drops it when it finishes. Two workers in the same test
 * run therefore never see each other's rows, and no suite depends on a table another suite created.
 *
 * The harness never creates a schema by hand: migrations are the only route from nothing to a usable
 * database, which is the same rule a shared environment follows.
 */
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client, Pool } from 'pg';
import * as schema from '../schema/index.ts';
import type { TransactionScope } from '../client.ts';

/** The committed migrations, read by the migrator and by the round-trip test. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** The reviewed down paths, one file per migration. */
export const DOWN_MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle/down', import.meta.url));

/** The typed client over a disposable database. */
export type TestDatabaseClient = NodePgDatabase<typeof schema>;

/** A live disposable database. */
export interface TestDatabase {
  /** The generated database name, unique per worker and per call. */
  readonly name: string;
  /** A connection string pointing at this database. */
  readonly connectionString: string;
  readonly db: TestDatabaseClient;
  readonly pool: Pool;
  /** Drops the public schema and re-applies every migration. */
  reset(): Promise<void>;
  /** Drops the database and closes the pool. */
  dispose(): Promise<void>;
}

let databaseCounter = 0;

function baseConnectionString(): string {
  const value = process.env.DATABASE_URL ?? localEnvironmentValue('DATABASE_URL');
  if (value === undefined || value === '') {
    throw new Error(
      'DATABASE_URL is required for the database test suites; point it at a disposable PostgreSQL 16 server (packages/db/AGENTS.md Checks).',
    );
  }
  return value;
}

/**
 * Reads one value from the repository's git-ignored `.env`, only when the process environment has not
 * supplied it. The local stack writes that file (`scripts/dev/services.mjs`), and an explicit
 * `DATABASE_URL` always wins so CI injects its own without a file.
 */
function localEnvironmentValue(name: string): string | undefined {
  const path = fileURLToPath(new URL('../../../../.env', import.meta.url));
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    if (trimmed.slice(0, separator) === name) {
      return trimmed.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function withDatabase(connectionString: string, databaseName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

function sanitize(part: string): string {
  return part.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Creates a disposable database and applies the committed migrations.
 *
 * @returns The handle the suite uses for its queries.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const base = baseConnectionString();
  const worker = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? '0';
  databaseCounter += 1;
  const name = sanitize(`odp_test_${process.pid}_${worker}_${databaseCounter}`).slice(0, 60);

  const admin = new Client({ connectionString: withDatabase(base, 'postgres') });
  await admin.connect();
  try {
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const connectionString = withDatabase(base, name);
  const pool = new Pool({ connectionString, max: 4, application_name: 'odp-test' });
  const db = drizzle(pool, { schema });

  const handle: TestDatabase = {
    name,
    connectionString,
    db,
    pool,
    async reset() {
      await pool.query('drop schema if exists public cascade');
      await pool.query('drop schema if exists drizzle cascade');
      await pool.query('create schema public');
      await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    },
    async dispose() {
      await pool.end();
      const cleanup = new Client({ connectionString: withDatabase(base, 'postgres') });
      await cleanup.connect();
      try {
        await cleanup.query(`drop database if exists "${name}" with (force)`);
      } finally {
        await cleanup.end();
      }
    },
  };

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return handle;
}

/**
 * Runs `work` against a freshly created database and always disposes it.
 *
 * The `finally` is the point: a failing assertion must not leak a database onto the server.
 */
export async function withTestDatabase<T>(
  work: (database: TestDatabase) => Promise<T>,
): Promise<T> {
  const database = await createTestDatabase();
  try {
    return await work(database);
  } finally {
    await database.dispose();
  }
}

/** Reads one reviewed down migration, for the round-trip test. */
export async function readDownMigration(name: string): Promise<string> {
  return readFile(
    fileURLToPath(new URL(`../../drizzle/down/${name}.down.sql`, import.meta.url)),
    'utf8',
  );
}

/** Reads one forward migration, for assertions about the committed SQL. */
export async function readMigration(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(`../../drizzle/${name}.sql`, import.meta.url)), 'utf8');
}

/**
 * Runs `work` inside one transaction on the test database.
 *
 * Exposed because the idempotency and audit rules are transactional: a test that claims a key outside
 * a transaction would prove nothing about the rule that the claim and the business change commit
 * together.
 */
export async function withTestTransaction<T>(
  database: TestDatabase,
  work: (scope: TransactionScope) => Promise<T>,
): Promise<T> {
  return database.db.transaction(async (tx) =>
    work({ tx: tx as TestDatabaseClient, isTransaction: true }),
  );
}
