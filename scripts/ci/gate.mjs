#!/usr/bin/env node
/**
 * The workflow's aggregate verdict (F0-03).
 *
 * `ci.yml` runs one job per check so a failure names the check that found it, which leaves the
 * branch with several status checks and no single answer to "is this branch good". This job is that
 * answer: it reads every other job's result and passes only when each one either passed or was
 * skipped for a capability the tree does not have yet (see `scripts/ci/capabilities.mjs`).
 *
 * `skipped` is accepted because a skip here is never silent — the `Preflight` job writes the reason
 * to the run summary — and because a required status check that is skipped has to mean "nothing to
 * check yet" rather than "someone bypassed me". Every other result, including `cancelled` and
 * `failure`, fails the check.
 *
 * The Phase 0 gate reads this job's name and its run summary to see the whole pipeline at a glance.
 *
 * Reads the `needs` context as JSON from `CI_RESULTS`; the workflow passes `${{ toJSON(needs) }}`.
 */
import { appendFileSync } from 'node:fs';

/** Results that do not fail the aggregate check. */
const ACCEPTED = new Set(['success', 'skipped']);

const raw = process.env.CI_RESULTS ?? '';

if (raw.trim() === '') {
  console.error('gate: CI_RESULTS is empty, so nothing was verified');
  process.exit(1);
}

/** @type {Record<string, { result?: string }>} */
let results;
try {
  results = JSON.parse(raw);
} catch {
  console.error('gate: CI_RESULTS is not valid JSON, so nothing was verified');
  process.exit(1);
}

const entries = Object.entries(results);
if (entries.length === 0) {
  console.error('gate: the workflow reported no jobs, so nothing was verified');
  process.exit(1);
}

const rows = entries.map(([job, outcome]) => ({
  job,
  result: String(outcome?.result ?? 'unknown'),
}));

const failed = rows.filter((row) => !ACCEPTED.has(row.result));
const skipped = rows.filter((row) => row.result === 'skipped');

for (const row of rows) {
  console.log(`gate: ${row.job.padEnd(12)} ${row.result}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '### Pipeline verdict',
    '',
    '| Job | Result |',
    '|---|---|',
    ...rows.map((row) => `| \`${row.job}\` | ${row.result} |`),
    '',
    skipped.length === 0
      ? 'Every job ran.'
      : `${skipped.length} job(s) skipped: ${skipped.map((row) => `\`${row.job}\``).join(', ')} (capability absent; see the Preflight summary).`,
  ];
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}

if (failed.length > 0) {
  for (const row of failed) {
    console.error(`gate: ${row.job} reported ${row.result}`);
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error title=${row.job}::The ${row.job} job reported ${row.result}.`);
    }
  }
  console.error(
    `gate: ${failed.length} of ${rows.length} job(s) did not pass; the branch is not ready to merge`,
  );
  process.exit(1);
}

console.log(
  `gate: ${rows.length} job(s) accounted for; every one passed or was skipped for a reason`,
);
