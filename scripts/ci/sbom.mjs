#!/usr/bin/env node
/**
 * Generate the software bill of materials from the resolved tree (`NFR-029`; F0-03).
 *
 * The source is the `packages:` section of the committed `pnpm-lock.yaml` — the resolved record the
 * workspace treats as authoritative, not the ranges the manifests declare. Two properties follow, and
 * both are the point:
 *
 * - **Pinned, not aspirational.** Every component carries a resolved version and the integrity hash
 *   pnpm recorded for it, so the BOM states what will be installed and can prove it. An entry that
 *   resolves to anything but a concrete version fails the script: `NFR-029` requires pinned versions,
 *   and a BOM full of ranges describes the request rather than the release.
 * - **Cross-platform by construction.** The section lists every package the lockfile can install,
 *   including the optional binaries each target platform needs. It is the superset a release is cut
 *   from, so the BOM does not silently change meaning depending on which machine generated it.
 *
 * The output is CycloneDX 1.5 JSON: names, versions, purls, SHA-512 hashes and distribution URLs. It
 * holds no path from the machine that produced it and no personal data. Reading the lockfile needs no
 * installed tree and no SBOM generator of its own, so producing the BOM adds no dependency to audit.
 *
 * The parser below reads one generated section of a generated file, so it is deliberately strict: a
 * line it cannot classify, an entry with no integrity hash and an unpinned version each stop the run
 * with the offending line, rather than producing a BOM with a hole in it.
 *
 * Usage:
 *
 *   node scripts/ci/sbom.mjs                      write build/sbom.cdx.json
 *   node scripts/ci/sbom.mjs --out <path>         write it somewhere else
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Default output, inside the git-ignored `build/` directory. */
const DEFAULT_OUT = join('build', 'sbom.cdx.json');

/** A top-level key of the lockfile, which is how the `packages:` section is bounded. */
const TOP_LEVEL_KEY = /^[a-z]/;

/** One package entry: two spaces, a quoted `name@version` key. */
const PACKAGE_KEY = /^ {2}('[^']+'|[^:\s][^:]*):$/;

/** The integrity line every package entry carries. */
const INTEGRITY = /\bintegrity: sha512-([A-Za-z0-9+/=]+)/;

/** The distribution URL, when the resolution records one. */
const TARBALL = /\btarball: (\S+?)[,}]/;

/** A resolved, pinned version: a semver triple, optionally with a prerelease or build suffix. */
const PINNED_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * @typedef {object} Component
 * @property {string} name - Package name.
 * @property {string} version - The resolved, pinned version.
 * @property {string} integrity - The SHA-512 digest, hex encoded.
 * @property {string | null} tarball - The recorded distribution URL.
 */

/**
 * Stop before writing anything, naming what went wrong.
 *
 * @param {string} message - What happened and what to do about it.
 * @returns {never} Never returns.
 */
function fail(message) {
  console.error(`sbom: ${message}`);
  process.exit(1);
}

/**
 * Read `--out` from the arguments.
 *
 * @param {string[]} argv - Arguments after the script name.
 * @returns {string} The output path, absolute.
 */
function outPathFrom(argv) {
  const index = argv.indexOf('--out');
  const value = index === -1 ? DEFAULT_OUT : argv[index + 1];
  if (value === undefined || value.trim() === '') {
    fail('--out needs a file path');
  }
  return resolve(repoRoot, value);
}

/**
 * The CycloneDX package URL for an npm package, with the scope separator encoded.
 *
 * @param {string} name - Package name, scoped or not.
 * @param {string} version - The pinned version.
 * @returns {string} A `pkg:npm/` purl.
 */
function purl(name, version) {
  const encoded = name.startsWith('@') ? `%40${name.slice(1)}` : name;
  return `pkg:npm/${encoded}@${version}`;
}

/**
 * Split a lockfile package key into its name and version.
 *
 * The key is `name@version`; a peer context is appended in parentheses elsewhere in the file, so it
 * is stripped defensively before the version is taken from the last `@`.
 *
 * @param {string} key - The key as written, quotes included.
 * @returns {{ name: string, version: string }} The two halves.
 */
function splitKey(key) {
  const unquoted = key.replace(/^'/, '').replace(/'$/, '');
  const bare = unquoted.replace(/\(.*$/, '');
  const at = bare.lastIndexOf('@');
  if (at <= 0) {
    fail(`cannot read a package name and version from "${unquoted}"`);
  }
  return { name: bare.slice(0, at), version: bare.slice(at + 1) };
}

/**
 * Read the resolved packages out of the lockfile.
 *
 * @param {string} lockfilePath - Absolute path to `pnpm-lock.yaml`.
 * @returns {Component[]} Every resolved package, in file order.
 */
function readLockfilePackages(lockfilePath) {
  const lines = readFileSync(lockfilePath, 'utf8').split(/\r?\n/);

  const start = lines.findIndex((line) => /^packages:\s*$/.test(line));
  if (start === -1) {
    fail('the lockfile has no packages section, so it records no resolved tree');
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (TOP_LEVEL_KEY.test(lines[index] ?? '')) {
      end = index;
      break;
    }
  }

  /** @type {Component[]} */
  const components = [];
  /** @type {string | null} */
  let pending = null;
  /** @type {string[]} */
  let block = [];

  /**
   * Finish the entry being read and push it.
   *
   * @param {string} key - The key line that opened the entry.
   * @param {string[]} body - The lines under it.
   * @returns {void}
   */
  const close = (key, body) => {
    const { name, version } = splitKey(key);
    if (!PINNED_VERSION.test(version)) {
      fail(
        `${name} resolved to "${version}", not a pinned version. NFR-029 requires pinned versions; a bill of materials of ranges describes the request, not the release`,
      );
    }
    const text = body.join('\n');
    const integrity = text.match(INTEGRITY);
    if (integrity === null || integrity[1] === undefined) {
      fail(
        `${name}@${version} has no SHA-512 integrity hash; refusing to publish a BOM that cannot be verified`,
      );
    }
    const tarball = text.match(TARBALL);
    components.push({
      name,
      version,
      integrity: Buffer.from(integrity[1], 'base64').toString('hex'),
      tarball: tarball === null || tarball[1] === undefined ? null : tarball[1],
    });
  };

  for (let index = start + 1; index < end; index += 1) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      continue;
    }
    if (PACKAGE_KEY.test(line)) {
      if (pending !== null) {
        close(pending, block);
      }
      const match = line.match(PACKAGE_KEY);
      pending = match?.[1] ?? line.trim().replace(/:$/, '');
      block = [];
      continue;
    }
    if (pending === null) {
      fail(`the packages section opens with an unexpected line: "${line}"`);
    }
    block.push(line);
  }
  if (pending !== null) {
    close(pending, block);
  }

  if (components.length === 0) {
    fail('the packages section is empty, so a bill of materials would describe nothing');
  }

  return components.sort((left, right) =>
    left.name === right.name
      ? left.version.localeCompare(right.version)
      : left.name.localeCompare(right.name),
  );
}

const outPath = outPathFrom(process.argv.slice(2));

const rootManifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const packageManager = String(rootManifest.packageManager ?? 'pnpm');
const components = readLockfilePackages(join(repoRoot, 'pnpm-lock.yaml'));

const bom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: 'application',
      'bom-ref': 'urn:odp:application',
      name: String(rootManifest.name ?? 'oyo-digital-parliament'),
      version: String(rootManifest.version ?? '0.0.0'),
    },
  },
  components: components.map((component) => ({
    type: 'library',
    'bom-ref': purl(component.name, component.version),
    name: component.name,
    version: component.version,
    purl: purl(component.name, component.version),
    hashes: [{ alg: 'SHA-512', content: component.integrity }],
    ...(component.tarball === null
      ? {}
      : { externalReferences: [{ type: 'distribution', url: component.tarball }] }),
  })),
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(bom, null, 2)}\n`);

const relativeOut = outPath
  .slice(repoRoot.length + 1)
  .split('\\')
  .join('/');
console.log(
  `sbom: wrote ${relativeOut} — ${components.length} resolved components with SHA-512 hashes, from ${packageManager}`,
);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      '### Software bill of materials (`NFR-029`)',
      '',
      `CycloneDX 1.5, written to \`${relativeOut}\` and uploaded as a workflow artefact.`,
      '',
      '| | |',
      '|---|---|',
      `| Resolved components | ${components.length} |`,
      "| Hashes | SHA-512, from each entry's recorded integrity |",
      `| Source | \`pnpm-lock.yaml\` packages section (\`${packageManager}\`) |`,
      '',
    ].join('\n'),
  );
}
