#!/usr/bin/env node
/**
 * Dependency audit gate over the resolved tree (`NFR-029`; F0-03).
 *
 * `pnpm audit` is the advisory source: one report over everything the lockfile resolves, development
 * dependencies included. A compromised build tool never ships, but it runs on the machine that
 * produces the release, so it is audited with the same severity bar as a runtime dependency.
 *
 * This script turns that report into a gate:
 *
 * - an advisory at or above the threshold fails the job. The threshold defaults to `critical`, the
 *   release bar `NFR-029` states: no known critical vulnerability at release;
 * - a lower advisory is recorded as a warning annotation and in the step summary, not failed. A high
 *   or moderate advisory still needs a decision, but that decision belongs to the technical lead and
 *   is taken once, deliberately, rather than by whatever a runner happened to resolve that day;
 * - a report that cannot be fetched or parsed fails closed. A security gate that passes because the
 *   advisory service was unreachable is worse than one that blocks and says why.
 *
 * Usage:
 *
 *   node scripts/ci/audit.mjs                    gate at critical (NFR-029)
 *   node scripts/ci/audit.mjs --threshold high   gate at high, for a promotion that wants a cleaner tree
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/** Severities in escalation order, as `pnpm audit` reports them. */
const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

/** What fails the job unless `--threshold` moves it. */
const DEFAULT_THRESHOLD = 'critical';

/** The report is larger than a process buffer's default; 32 MB is far above any tree this workspace holds. */
const MAX_REPORT_BYTES = 32 * 1024 * 1024;

/**
 * @typedef {object} Finding
 * @property {string} id - Advisory id.
 * @property {string} package - The affected package name.
 * @property {string} severity - One of {@link SEVERITIES}.
 * @property {string} title - The advisory's title.
 * @property {string} range - The vulnerable version range.
 * @property {string | null} url - The advisory's public page.
 */

/**
 * Stop the gate with a message that says what happened.
 *
 * @param {string} message - What happened and what to do about it.
 * @returns {never} Never returns.
 */
function fail(message) {
  console.error(`audit: ${message}`);
  process.exit(1);
}

/**
 * Read `--threshold` from the arguments.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {string} One of {@link SEVERITIES}.
 */
function thresholdFrom(argv) {
  const index = argv.indexOf('--threshold');
  if (index === -1) {
    return DEFAULT_THRESHOLD;
  }
  const value = argv[index + 1];
  if (value === undefined || !SEVERITIES.includes(value)) {
    fail(`--threshold needs one of ${SEVERITIES.join(', ')}`);
  }
  return value;
}

/**
 * A severity spelling from the report, narrowed to one this script knows.
 *
 * @param {unknown} value - The reported severity.
 * @returns {string} One of {@link SEVERITIES}.
 */
function normaliseSeverity(value) {
  const text = String(value ?? '').toLowerCase();
  return SEVERITIES.includes(text) ? text : 'info';
}

/**
 * The advisory's public page: its own `url` when the report carries one, otherwise the first link in
 * its references, which is where the same page appears in npm's advisory database.
 *
 * @param {Record<string, unknown>} advisory - One advisory from the report.
 * @returns {string | null} An absolute URL, or null when the report carried none.
 */
function advisoryUrl(advisory) {
  if (typeof advisory.url === 'string' && advisory.url.startsWith('http')) {
    return advisory.url;
  }
  const references = typeof advisory.references === 'string' ? advisory.references : '';
  const match = references.match(/https?:\/\/\S+/);
  return match === null ? null : match[0];
}

/**
 * Every advisory in the report, in one shape, whichever vintage of the report arrived.
 *
 * pnpm reports under `advisories`, keyed by advisory id, with `module_name` and `vulnerable_versions`;
 * npm's newer shape reports under `vulnerabilities`, keyed by package name. Both are read, so a pnpm
 * upgrade cannot silently turn this gate into a no-op.
 *
 * @param {Record<string, unknown>} report - The parsed report.
 * @returns {Finding[]} The findings, in report order.
 */
function collectFindings(report) {
  /** @type {Finding[]} */
  const findings = [];

  if (report.advisories !== null && typeof report.advisories === 'object') {
    /** @type {Record<string, Record<string, unknown>>} */
    const advisories = /** @type {any} */ (report.advisories);
    for (const [id, advisory] of Object.entries(advisories)) {
      findings.push({
        id: String(advisory.id ?? id),
        package: String(advisory.module_name ?? advisory.name ?? 'unknown'),
        severity: normaliseSeverity(advisory.severity),
        title: String(advisory.title ?? 'advisory'),
        range: String(advisory.vulnerable_versions ?? ''),
        url: advisoryUrl(advisory),
      });
    }
    return findings;
  }

  if (report.vulnerabilities !== null && typeof report.vulnerabilities === 'object') {
    /** @type {Record<string, Record<string, unknown>>} */
    const vulnerabilities = /** @type {any} */ (report.vulnerabilities);
    for (const [name, entry] of Object.entries(vulnerabilities)) {
      const via = Array.isArray(entry.via) ? entry.via : [];
      const detail = via.find((item) => item !== null && typeof item === 'object');
      findings.push({
        id: detail === undefined ? name : String(detail.source ?? name),
        package: name,
        severity: normaliseSeverity(entry.severity),
        title: detail === undefined ? 'advisory' : String(detail.title ?? 'advisory'),
        range: String(entry.range ?? ''),
        url: detail === undefined ? null : advisoryUrl(detail),
      });
    }
  }

  return findings;
}

/**
 * Advisories per severity, from the report's own totals when it carried them, otherwise counted from
 * the findings it listed.
 *
 * @param {Record<string, unknown>} report - The parsed report.
 * @param {Finding[]} findings - The advisories the report listed.
 * @returns {{ counts: Record<string, number>, totalsKnown: boolean }} Per-severity totals, and whether
 *   the report supplied totals of its own.
 */
function severityCounts(report, findings) {
  const metadata =
    report.metadata === null || report.metadata === undefined
      ? {}
      : /** @type {Record<string, unknown>} */ (report.metadata);
  const reported = metadata.vulnerabilities;
  const totalsKnown = reported !== null && reported !== undefined && typeof reported === 'object';

  /** @type {Record<string, number>} */
  const counts = {};
  for (const severity of SEVERITIES) {
    counts[severity] = totalsKnown
      ? Number(/** @type {Record<string, unknown>} */ (reported)[severity] ?? 0)
      : findings.filter((finding) => finding.severity === severity).length;
  }

  return { counts, totalsKnown: totalsKnown || findings.length > 0 };
}

const argv = process.argv.slice(2);
const threshold = thresholdFrom(argv);
const thresholdIndex = SEVERITIES.indexOf(threshold);

// pnpm is a shell script on Windows and a shell command everywhere else, so the call goes through a
// shell. The command and its arguments are fixed literals, so nothing is interpolated into it.
const result = spawnSync('pnpm audit --json', {
  encoding: 'utf8',
  maxBuffer: MAX_REPORT_BYTES,
  shell: true,
});

const stdout = result.stdout ?? '';
const stderr = result.stderr ?? '';

/** @type {Record<string, unknown>} */
let report;
try {
  report = JSON.parse(stdout);
} catch {
  const tail = `${stdout}\n${stderr}`.trim().split(/\r?\n/).slice(-20).join('\n');
  fail(
    `the advisory report could not be read, so the tree was not audited. A security gate does not pass blind.\n${tail}`,
  );
}

const findings = collectFindings(report);
const { counts, totalsKnown } = severityCounts(report, findings);

if (!totalsKnown) {
  fail(
    'the advisory report carried neither severity totals nor advisories, so the tree was not audited. A security gate does not pass blind.',
  );
}

const blocking = findings.filter(
  (finding) => SEVERITIES.indexOf(finding.severity) >= thresholdIndex,
);
const blockingCount = SEVERITIES.slice(thresholdIndex).reduce(
  (total, severity) => total + (counts[severity] ?? 0),
  0,
);

const metadata =
  report.metadata === null || report.metadata === undefined
    ? {}
    : /** @type {Record<string, unknown>} */ (report.metadata);

const summary = [
  '### Dependency audit (`NFR-029`)',
  '',
  `Bar: **${threshold}**. Packages audited: **${String(metadata.totalDependencies ?? 'unknown')}**.`,
  '',
  '| Severity | Advisories |',
  '|---|---|',
  ...SEVERITIES.slice()
    .reverse()
    .map((severity) => `| ${severity} | ${counts[severity] ?? 0} |`),
];

if (findings.length > 0) {
  summary.push('', '| Severity | Package | Affected versions | Advisory |', '|---|---|---|---|');
  const ordered = findings
    .slice()
    .sort((left, right) => SEVERITIES.indexOf(right.severity) - SEVERITIES.indexOf(left.severity));
  for (const finding of ordered) {
    const link = finding.url === null ? finding.title : `[${finding.title}](${finding.url})`;
    summary.push(`| ${finding.severity} | \`${finding.package}\` | ${finding.range} | ${link} |`);
  }
}

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}

for (const finding of blocking) {
  console.error(
    `audit: ${finding.severity} advisory in ${finding.package} (${finding.range}): ${finding.title}${
      finding.url === null ? '' : ` — ${finding.url}`
    }`,
  );
  if (process.env.GITHUB_ACTIONS) {
    console.log(
      `::error title=${finding.package} ${finding.severity} advisory::${finding.title}${
        finding.url === null ? '' : ` — ${finding.url}`
      }`,
    );
  }
}

if (process.env.GITHUB_ACTIONS) {
  for (const finding of findings) {
    if (SEVERITIES.indexOf(finding.severity) < thresholdIndex) {
      console.log(
        `::warning title=${finding.package} ${finding.severity} advisory::${finding.title}. Below the ${threshold} bar; recorded in the run summary.`,
      );
    }
  }
}

const recorded = findings.length;
console.log(
  `audit: ${blockingCount === 0 ? 'clean' : `${blockingCount} blocking`} at the ${threshold} bar; ${recorded} advisor${
    recorded === 1 ? 'y' : 'ies'
  } recorded in total`,
);

if (blockingCount > 0) {
  fail(
    `${blockingCount} advisor${blockingCount === 1 ? 'y' : 'ies'} at or above the ${threshold} bar. Resolve them before this branch can merge, or record the exception in an ADR and move the bar deliberately.`,
  );
}
