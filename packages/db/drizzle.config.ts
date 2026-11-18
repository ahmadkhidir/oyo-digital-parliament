/**
 * drizzle-kit configuration for `packages/db`.
 *
 * `schema` points at the barrel, so a table is in the schema because a module exports it there and
 * for no other reason. `out` is `drizzle/`, whose journal is append-only: a migration that has run
 * anywhere is never edited or renumbered. `dbCredentials` is read from `DATABASE_URL` only because
 * `db:migrate` needs it; `db:generate` and `db:check` work offline.
 */
import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://odp_local:odp_local_dev_password@127.0.0.1:5433/odp_local';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
  // Fail the generation rather than silently producing a migration from a prompt.
  strict: true,
  verbose: true,
});
