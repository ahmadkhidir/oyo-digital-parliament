/**
 * The `db:seed` entry point (`packages/db/package.json`).
 *
 * Reads the validated configuration and seeds the reference data. The operator's one-time password
 * comes from `STAFF_OPERATOR_INITIAL_PASSWORD`, a deployment secret that this entry hands to the seed
 * and never prints; the seed hashes it with the `NFR-021` adapter before storing it, and a clean
 * deployment with no secret fails here rather than leaving an account nobody can sign in to
 * (`operations.md` Staff sign-in, ADR-004).
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
