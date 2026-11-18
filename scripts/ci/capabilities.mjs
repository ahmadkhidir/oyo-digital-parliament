#!/usr/bin/env node
/**
 * Report which Phase 0 capabilities the tree under test provides (F0-03).
 *
 * Four jobs in `.github/workflows/ci.yml` have a subject that a later Phase 0 task supplies:
 * `pnpm build` needs a route to build (F0-09), `pnpm db:check` needs a drizzle configuration and the
 * migration journal it checks (F0-04), and the two Playwright jobs need flows to run (F0-14). Running
 * them against a tree that does not have their subject paints `main` red for a reason no pull request
 * can fix, and that red run hides the regression the pipeline exists to catch.
 *
 * So the workflow asks this probe first and skips only the job whose subject is absent, with a
 * warning annotation naming what is missing and which task supplies it. Nothing here weakens a job
 * that has a subject: an `e2e/` directory with no spec file still fails through Playwright, and a
 * drizzle config with a broken journal still fails `db:check`. The probe answers one question per
 * capability — does the subject exist at all.
 *
 * The probe retires with Phase 0. Once F0-04, F0-09 and F0-14 have landed every value reads `true`,
 * every job runs, and this script and the `needs: preflight` edges around it are deleted together.
 *
 * Outputs, written to `$GITHUB_OUTPUT` and to stdout for a local run:
 *
 *   web_app=true|false        a Next.js route root exists
 *   db_schema=true|false      the data area has a drizzle configuration
 *   browser_flows=true|false  `apps/web/e2e/` holds at least one Playwright flow
 *   a11y_flows=true|false     at least one of those flows carries an `@a11y` tag
 */
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Directories Next.js will build from. `apps/web` is the single deployable; both the App Router and
 * the Pages Router layouts are accepted so the probe does not have to move when a route is added.
 */
const ROUTE_ROOTS = ['apps/web/app', 'apps/web/src/app', 'apps/web/pages', 'apps/web/src/pages'];

/** The drizzle configuration names `drizzle-kit` looks for, in the order it looks for them. */
const DRIZZLE_CONFIGS = [
  'drizzle.config.ts',
  'drizzle.config.mts',
  'drizzle.config.js',
  'drizzle.config.mjs',
  'drizzle.config.json',
].map((name) => join('packages', 'db', name));

/** Playwright's default spec pattern, narrowed to the extensions this repository writes. */
const FLOW_FILE = /\.(?:spec|test)\.[cm]?[jt]sx?$/;

/** The tag that marks a flow as an accessibility scan (`apps/web/playwright.config.ts`). */
const A11Y_TAG = /@a11y\b/;

/**
 * Record one capability, for the workflow and for a human reading the log.
 *
 * @param {string} name - The output name the workflow reads.
 * @param {boolean} value - Whether the capability's subject exists.
 * @param {string} detail - What was found, or what is missing and where it comes from.
 * @returns {void}
 */
function report(name, value, detail) {
  const line = `${name}=${value}`;
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
  }
  console.log(`${line}\t${detail}`);
}

/**
 * Every Playwright flow file under a directory, recursively.
 *
 * A missing directory is not an error: that is exactly the state this probe exists to describe.
 *
 * @param {string} directory - Absolute path to walk.
 * @returns {string[]} Absolute paths of the flow files found, sorted for a stable log.
 */
function flowFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  /** @type {string[]} */
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...flowFiles(path));
    } else if (entry.isFile() && FLOW_FILE.test(entry.name)) {
      found.push(path);
    }
  }
  return found.sort();
}

/**
 * Append a line to the run's step summary when the workflow asked for one.
 *
 * @param {string} markdown - The line to add.
 * @returns {void}
 */
function summarise(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

// A route root, not a route file: Next.js refuses to build without one, which is the failure this
// capability describes.
const routeRoot = ROUTE_ROOTS.find((path) => existsSync(resolve(repoRoot, path)));
report(
  'web_app',
  routeRoot !== undefined,
  routeRoot === undefined
    ? 'no Next.js route root under apps/web; F0-09 adds the first route'
    : `route root ${routeRoot}`,
);

const drizzleConfig = DRIZZLE_CONFIGS.find((path) => existsSync(resolve(repoRoot, path)));
report(
  'db_schema',
  drizzleConfig !== undefined,
  drizzleConfig === undefined
    ? 'no drizzle configuration in packages/db; F0-04 adds the schema and its migration journal'
    : `configuration ${drizzleConfig}`,
);

const flows = flowFiles(resolve(repoRoot, 'apps', 'web', 'e2e'));
report(
  'browser_flows',
  flows.length > 0,
  flows.length === 0
    ? 'no Playwright flow under apps/web/e2e; F0-14 adds them'
    : `${flows.length} flow file(s)`,
);

const accessibilityFlows = flows.filter((path) => A11Y_TAG.test(readFileSync(path, 'utf8')));
report(
  'a11y_flows',
  accessibilityFlows.length > 0,
  accessibilityFlows.length === 0
    ? 'no flow tagged @a11y; F0-14 adds the tagged axe scans'
    : `${accessibilityFlows.length} tagged flow file(s)`,
);

// The summary is what the Phase 0 gate reads to tell an expected skip from a silent pass.
summarise('| Capability | Present | Detail |');
summarise('|---|---|---|');
for (const [capability, value, detail] of [
  ['web_app', routeRoot !== undefined, routeRoot ?? 'absent'],
  ['db_schema', drizzleConfig !== undefined, drizzleConfig ?? 'absent'],
  ['browser_flows', flows.length > 0, `${flows.length} flow file(s)`],
  ['a11y_flows', accessibilityFlows.length > 0, `${accessibilityFlows.length} tagged flow file(s)`],
]) {
  summarise(`| \`${capability}\` | ${value ? 'yes' : 'no'} | ${detail} |`);
}

for (const [capability, value, detail] of [
  ['web_app', routeRoot !== undefined, 'the Build job is skipped until F0-09 lands'],
  [
    'db_schema',
    drizzleConfig !== undefined,
    'the Migration check job is skipped until F0-04 lands',
  ],
  ['browser_flows', flows.length > 0, 'the e2e job is skipped until F0-14 lands'],
  ['a11y_flows', accessibilityFlows.length > 0, 'the axe job is skipped until F0-14 lands'],
]) {
  if (!value && process.env.GITHUB_ACTIONS) {
    console.log(`::warning title=${capability}::${detail}`);
  }
}
