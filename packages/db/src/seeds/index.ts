/**
 * The `db:seed` entry point (`packages/db/package.json`).
 *
 * Reads `DATABASE_URL` through the package client, seeds the reference data and exits non-zero when
 * the run fails. Nothing is printed about a row's content beyond the counts, and no personal data
 * exists in either data set to print.
 */
import { closeDatabase, getDatabase } from '../client.ts';
import { runSeeds } from './run.ts';

try {
  const report = await runSeeds(getDatabase().db);
  process.stdout.write(
    `wards: ${report.wards.inserted} added, ${report.wards.existing} already present. ` +
      `rules: ${report.rules.inserted} added, ${report.rules.existing} already present.\n`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`seed failed: ${message}\n`);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
