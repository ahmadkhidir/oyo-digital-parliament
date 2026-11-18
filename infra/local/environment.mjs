/**
 * The local development environment contract.
 *
 * One module owns every variable the local stack and the workspace read in development: its shape,
 * its secret classification and the disposable placeholder that `scripts/dev/env.mjs render` writes
 * into `.env.example`. `scripts/dev/services.mjs` refuses to start Docker until a real `.env` passes
 * this contract, and `scripts/dev/env.mjs check` is the same validation from the command line.
 *
 * The values below are local placeholders only. The Development environment holds synthetic data and
 * "resets freely" (`architecture.md` Environments, `nfr.md` Data lifecycle); a real credential never
 * enters this repository (`NFR-024`). Staging and production values come from the managed secret
 * store, and a missing secret fails boot instead of falling back to a default.
 *
 * The file is the single definition. `docker-compose.yml` interpolates the PostgreSQL, Redis and
 * object-storage variables from the same `.env`, and both the web app and the worker are configured
 * from it through `@odp/platform`. When that package lands its configuration schema
 * (`packages/platform/src/config/schema.ts`, F0-10) the schema becomes the single source of truth for
 * the application and supersedes this contract; until then this is the one place a local variable is
 * declared.
 *
 * Nothing here logs, echoes or reports a value; a problem message names the variable and the reason.
 *
 * @module infra/local/environment
 */

import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

/** The Compose project name. `reset` passes it to every Docker call, so it can only reach this stack. */
export const COMPOSE_PROJECT_NAME = 'odp-local';

/** The environment file both the app and the worker read in development. Git-ignored. */
export const ENV_FILE_NAME = '.env';

/** The committed example file: shape and disposable defaults only, rendered from this module. */
export const EXAMPLE_FILE_NAME = '.env.example';

/** Hosts that mean "this machine". A connection string aimed at another host is not cross-checked. */
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Default ports per scheme, used only to compare a URL with the port it actually reaches. */
const DEFAULT_PORTS = new Map([
  ['postgres:', '5432'],
  ['postgresql:', '5432'],
  ['redis:', '6379'],
  ['http:', '80'],
  ['https:', '443'],
]);

/** A PostgreSQL role or database name: lower case, digits and underscores, not starting with a digit. */
const DB_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** S3 bucket naming rule: 3-63 characters, lower-case, digits, dots and hyphens, alphanumeric ends. */
const BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

/**
 * The variables, in the order `.env.example` renders them.
 *
 * `secret` marks a value a log or an error must never echo. `check` selects the validator and its
 * options. `example` is the disposable placeholder written to `.env.example` and, through it, to the
 * `.env` that `services.mjs up` creates on first run.
 */
export const VARIABLES = [
  {
    name: 'DATABASE_URL',
    group: 'postgres',
    description:
      'Connection string for the Primary Database; used by the app, the worker and drizzle-kit.',
    secret: true,
    example: 'postgresql://odp_local:odp_local_dev_password@127.0.0.1:5433/odp_local',
    check: { kind: 'url', protocols: ['postgres:', 'postgresql:'], requiresPath: true },
  },
  {
    name: 'POSTGRES_USER',
    group: 'postgres',
    description: 'Role the local PostgreSQL container creates and DATABASE_URL connects as.',
    secret: false,
    example: 'odp_local',
    check: { kind: 'identifier' },
  },
  {
    name: 'POSTGRES_PASSWORD',
    group: 'postgres',
    description:
      'Password for that role. A local placeholder only; a real secret never lives here.',
    secret: true,
    example: 'odp_local_dev_password',
    check: { kind: 'text' },
  },
  {
    name: 'POSTGRES_DB',
    group: 'postgres',
    description: 'Database the container creates on first start.',
    secret: false,
    example: 'odp_local',
    check: { kind: 'identifier' },
  },
  {
    name: 'POSTGRES_PORT',
    group: 'postgres',
    description:
      'Host port the container publishes; DATABASE_URL must use it. Off the standard 5432 so a PostgreSQL already installed here keeps its port.',
    secret: false,
    example: '5433',
    check: { kind: 'port' },
  },
  {
    name: 'REDIS_URL',
    group: 'redis',
    description:
      'Read cache, session store and rate-limit counters. No password: the host port is bound to this machine only.',
    secret: false,
    example: 'redis://127.0.0.1:6380',
    check: { kind: 'url', protocols: ['redis:'], requiresPath: false },
  },
  {
    name: 'REDIS_PORT',
    group: 'redis',
    description:
      'Host port the container publishes; REDIS_URL must use it. Off the standard 6379 so a Redis already installed here keeps its port.',
    secret: false,
    example: '6380',
    check: { kind: 'port' },
  },
  {
    name: 'S3_ENDPOINT',
    group: 'storage',
    description:
      'S3-compatible endpoint for the object store (exports, report cards, handover snapshot, evaluation artefacts).',
    secret: false,
    example: 'http://127.0.0.1:9100',
    check: { kind: 'url', protocols: ['http:', 'https:'], requiresPath: false },
  },
  {
    name: 'S3_REGION',
    group: 'storage',
    description: 'Region the client signs requests with. The local store accepts any value.',
    secret: false,
    example: 'us-east-1',
    check: { kind: 'text' },
  },
  {
    name: 'S3_BUCKET',
    group: 'storage',
    description:
      'Private bucket. Nothing in it is publicly readable; reads go through a signed URL.',
    secret: false,
    example: 'odp-local',
    check: { kind: 'bucket' },
  },
  {
    name: 'S3_ACCESS_KEY_ID',
    group: 'storage',
    description: 'Access key for the local store. A local placeholder only.',
    secret: true,
    example: 'odp-local-access-key',
    check: { kind: 'text' },
  },
  {
    name: 'S3_SECRET_ACCESS_KEY',
    group: 'storage',
    description: 'Secret key for the local store. A local placeholder only.',
    secret: true,
    example: 'odp-local-secret-key',
    check: { kind: 'text' },
  },
  {
    name: 'S3_FORCE_PATH_STYLE',
    group: 'storage',
    description:
      '"true", because the local endpoint is an address rather than a per-bucket hostname.',
    secret: false,
    example: 'true',
    check: { kind: 'boolean' },
  },
  {
    name: 'S3_PORT',
    group: 'storage',
    description:
      'Host port the object store publishes; S3_ENDPOINT must use it. Off the common 9000 so another local store keeps its port.',
    secret: false,
    example: '9100',
    check: { kind: 'port' },
  },
];

/** Human headings for the rendered example file. */
const GROUP_HEADINGS = new Map([
  ['postgres', 'Primary Database - PostgreSQL 16 (architecture.md: Data Stores)'],
  ['redis', 'Read cache, sessions and rate-limit counters - Redis 7'],
  ['storage', 'Object storage - S3-compatible, private bucket'],
]);

/**
 * Whether a hostname names this machine. A connection string aimed elsewhere is deliberately not
 * compared with the local stack's port: it may point at a staging service on purpose.
 *
 * @param {string} hostname - The hostname from a parsed URL.
 * @returns {boolean} True when the host is loopback.
 */
function isLoopback(hostname) {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

/**
 * The port a URL actually reaches, taking the scheme's default into account.
 *
 * @param {URL} url - A parsed connection URL.
 * @returns {string} The explicit port, or the scheme's default, or an empty string.
 */
function effectivePort(url) {
  return url.port === '' ? (DEFAULT_PORTS.get(url.protocol) ?? '') : url.port;
}

/**
 * Validators, one per `check.kind`. Each returns `null` when the value is acceptable, or the reason
 * it is not. A reason is appended to the variable name and never quotes the value, so a secret
 * cannot leak through a failure message.
 *
 * @type {Record<string, (value: string, spec: Record<string, unknown>) => string | null>}
 */
const CHECKERS = {
  url(value, spec) {
    if (value !== value.trim()) return 'must not start or end with whitespace';
    if (/\s/.test(value)) return 'must not contain whitespace';
    let url;
    try {
      url = new URL(value);
    } catch {
      return 'is not a valid URL';
    }
    const protocols = /** @type {string[]} */ (spec.protocols);
    if (!protocols.includes(url.protocol)) {
      return `must use the ${protocols.join(' or ')} scheme`;
    }
    if (url.hostname === '') return 'must name a host';
    if (spec.requiresPath === true) {
      const path = url.pathname.replace(/^\//, '');
      if (path === '') return 'must name a database in its path';
    }
    return null;
  },

  port(value) {
    if (!/^[0-9]+$/.test(value)) return 'must be a whole number between 1 and 65535';
    const port = Number(value);
    if (port < 1 || port > 65535) return 'must be between 1 and 65535';
    return null;
  },

  boolean(value) {
    return value === 'true' || value === 'false' ? null : 'must be "true" or "false"';
  },

  identifier(value) {
    return DB_IDENTIFIER.test(value)
      ? null
      : 'must be lower case letters, digits or underscores, and not start with a digit';
  },

  bucket(value) {
    if (!BUCKET_NAME.test(value)) {
      return 'must be 3-63 lower-case letters, digits, dots or hyphens, starting and ending alphanumeric';
    }
    if (value.includes('..')) return 'must not contain two adjacent dots';
    return null;
  },

  text(value) {
    return value.trim() === '' ? 'must not be empty' : null;
  },
};

/**
 * Compare a connection URL's port with the host port the stack publishes.
 *
 * @param {string[]} problems - Collected problem messages.
 * @param {string} variable - The URL variable being checked.
 * @param {URL} url - The parsed URL.
 * @param {string} portVariable - The variable naming the published port.
 * @param {Record<string, string>} values - The validated environment.
 * @returns {void}
 */
function comparePort(problems, variable, url, portVariable, values) {
  const urlPort = effectivePort(url);
  if (urlPort !== values[portVariable]) {
    problems.push(
      `${variable} reaches port ${urlPort} but ${portVariable} is ${values[portVariable]}; they must describe the same local service`,
    );
  }
}

/**
 * The cross-field checks that catch an environment edited in two places and drifted.
 *
 * They run only when every variable passed its own check, and only against a loopback host: a URL
 * that points at another host is not this stack's business.
 *
 * @param {Record<string, string>} values - The validated environment.
 * @returns {string[]} Problem messages, each naming a variable and no value.
 */
function crossCheck(values) {
  /** @type {string[]} */
  const problems = [];

  const database = new URL(values.DATABASE_URL);
  if (isLoopback(database.hostname)) {
    comparePort(problems, 'DATABASE_URL', database, 'POSTGRES_PORT', values);

    const databaseName = decodeURIComponent(database.pathname.replace(/^\//, ''));
    if (databaseName !== values.POSTGRES_DB) {
      problems.push(
        `DATABASE_URL names database "${databaseName}" but POSTGRES_DB is "${values.POSTGRES_DB}"; they must match`,
      );
    }

    const role = decodeURIComponent(database.username);
    if (role !== values.POSTGRES_USER) {
      problems.push(
        `DATABASE_URL connects as "${role}" but POSTGRES_USER is "${values.POSTGRES_USER}"; they must match`,
      );
    }

    // Compared, never printed: the message states only that the two disagree.
    const password = decodeURIComponent(database.password);
    if (password !== values.POSTGRES_PASSWORD) {
      problems.push(
        'DATABASE_URL carries a password that does not match POSTGRES_PASSWORD; they must be the same local placeholder',
      );
    }
  }

  const redis = new URL(values.REDIS_URL);
  if (isLoopback(redis.hostname)) {
    comparePort(problems, 'REDIS_URL', redis, 'REDIS_PORT', values);
  }

  const storage = new URL(values.S3_ENDPOINT);
  if (isLoopback(storage.hostname)) {
    comparePort(problems, 'S3_ENDPOINT', storage, 'S3_PORT', values);
  }

  return problems;
}

/**
 * Validate a candidate environment.
 *
 * Values from the process environment win over values from the file, the same precedence a
 * dotenv loader uses, so CI can inject a value without writing a file. An empty value counts as
 * unset rather than as an override.
 *
 * @param {{ env?: NodeJS.ProcessEnv, fileValues?: Record<string, string> }} [input] - Sources to merge.
 * @returns {{ values: Record<string, string>, problems: string[] }} The valid values and every problem found.
 */
export function validateEnvironment({ env = process.env, fileValues = {} } = {}) {
  /** @type {Record<string, string>} */
  const merged = { ...fileValues };
  for (const variable of VARIABLES) {
    const fromProcess = env[variable.name];
    if (typeof fromProcess === 'string' && fromProcess.trim() !== '') {
      merged[variable.name] = fromProcess;
    }
  }

  /** @type {Record<string, string>} */
  const values = {};
  /** @type {string[]} */
  const problems = [];

  for (const variable of VARIABLES) {
    const raw = merged[variable.name];
    if (typeof raw !== 'string' || raw.trim() === '') {
      problems.push(`${variable.name} is not set`);
      continue;
    }
    const problem = CHECKERS[variable.check.kind](raw, variable.check);
    if (problem !== null) {
      problems.push(`${variable.name} ${problem}`);
      continue;
    }
    values[variable.name] = raw;
  }

  if (problems.length === 0) {
    problems.push(...crossCheck(values));
  }

  return { values, problems };
}

/**
 * Read one environment file.
 *
 * @param {string} path - Absolute path to the file.
 * @returns {{ values: Record<string, string>, missing: boolean, problem: string | null }} The parsed
 *   values, whether the file was absent, and a read or parse problem if there was one.
 */
export function readEnvironmentFile(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') {
      return { values: {}, missing: true, problem: null };
    }
    return {
      values: {},
      missing: false,
      problem: `cannot read ${path}: ${/** @type {Error} */ (error).message}`,
    };
  }

  try {
    return { values: parseEnv(text), missing: false, problem: null };
  } catch (error) {
    return {
      values: {},
      missing: false,
      problem: `cannot parse ${path}: ${/** @type {Error} */ (error).message}`,
    };
  }
}

/**
 * Read an environment file and validate it in one step.
 *
 * @param {{ filePath: string, env?: NodeJS.ProcessEnv }} input - The file to read and the process environment.
 * @returns {{ values: Record<string, string>, problems: string[], fileMissing: boolean }} The validated
 *   values, every problem found, and whether the file itself was absent.
 */
export function loadEnvironment({ filePath, env = process.env }) {
  const file = readEnvironmentFile(filePath);
  if (file.problem !== null) {
    return { values: {}, problems: [file.problem], fileMissing: false };
  }
  const { values, problems } = validateEnvironment({ env, fileValues: file.values });
  return { values, problems, fileMissing: file.missing };
}

/**
 * Render `.env.example` from the contract.
 *
 * The example carries shape and disposable defaults only: every value is a local placeholder, and
 * the header says so. It is generated so the committed file cannot drift from the variables the
 * scripts validate.
 *
 * @returns {string} The full example file, ending in a newline.
 */
export function renderExample() {
  const lines = [
    '# Oyo Digital Parliament - local development environment.',
    '#',
    '# Rendered from `infra/local/environment.mjs`. Change the contract there and run',
    '# `node scripts/dev/env.mjs render`, then `node scripts/dev/env.mjs check` to prove it.',
    '#',
    '# Copy this file to `.env` (or let `node scripts/dev/services.mjs up` do it) to run the local',
    '# stack. `.env` is git-ignored and must never be committed.',
    '#',
    '# Every value below is a disposable local placeholder for the Development environment. There is',
    '# no real credential in this repository: staging and production values live in the managed secret',
    '# store, and an unset secret fails boot rather than falling back to a default (NFR-024).',
    '#',
    '# `process.env` wins over `.env`, so CI can inject values without a file. Validation never prints',
    '# a value: `node scripts/dev/env.mjs check` names the missing or malformed variable instead.',
  ];

  /** @type {string | null} */
  let currentGroup = null;
  for (const variable of VARIABLES) {
    if (variable.group !== currentGroup) {
      lines.push('', `# ${GROUP_HEADINGS.get(variable.group) ?? variable.group}`);
      currentGroup = variable.group;
    }
    lines.push(`# ${variable.description}`);
    lines.push(`${variable.name}=${variable.example}`);
  }

  return `${lines.join('\n')}\n`;
}
