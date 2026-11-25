/**
 * The `db:seed` entry point (`packages/db/package.json`).
 *
 * Reads the validated configuration and seeds the reference data. Each seeded staff credential takes
 * its one-time password from its own deployment secret - `STAFF_OPERATOR_INITIAL_PASSWORD` for the
 * operator, `STAFF_RESPONSE_STAFF_INITIAL_PASSWORD` for the response-staff member. Both are handed to
 * the seed here and never printed; the seed hashes each with the `NFR-021` adapter before storing it,
 * and a clean deployment with a missing secret fails here rather than leaving an account nobody can
 * sign in to (`operations.md` Staff sign-in, ADR-004, `C-092`).
 *
 * Nothing is printed about a row's content beyond the counts, and neither data set holds personal
 * data to print.
 */
import { createCredentialAdapters, loadConfig } from '@odp/platform';
import { closeDatabase, getDatabase } from '../client.ts';
import { runSeeds } from './run.ts';

try {
  // The seed reads the same validated configuration the application and the worker boot from, so a
  // missing or malformed deployment value fails before any row is written.
  const config = loadConfig();
  const { hasher } = createCredentialAdapters(config.credentials);

  const report = await runSeeds(getDatabase().db, {
    hasher,
    operatorInitialPassword: config.credentials.operatorInitialPassword,
    responseStaffInitialPassword: config.credentials.responseStaffInitialPassword,
  });
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
