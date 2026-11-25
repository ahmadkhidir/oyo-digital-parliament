/**
 * The local development environment contract.
 *
 * The application variables are not declared here: `packages/platform/src/config/schema.ts` owns
 * them, and this module imports that schema so the local stack, the app and the worker validate one
 * list (`packages/platform/AGENTS.md` Structure; `NFR-024`). What this file adds is the local-only
 * plumbing the Compose stack reads (the PostgreSQL role, database and published ports) and the
 * disposable placeholder each variable carries in `.env.example`.
 *
 * `scripts/dev/services.mjs` refuses to start Docker until a real `.env` passes this contract, and
 * `scripts/dev/env.mjs check` is the same validation from the command line.
 *
 * The values below are local placeholders only. The Development environment holds synthetic data and
 * "resets freely" (`architecture.md` Environments, `nfr.md` Data lifecycle); a real credential never
 * enters this repository (`NFR-024`). Staging and production values come from the managed secret
 * store, and a missing secret fails boot instead of falling back to a default.
 *
 * Nothing here logs, echoes or reports a value; a problem message names the variable and the reason.
 *
 * @module infra/local/environment
 */

import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import {
  GROUP_HEADINGS,
  parseVariable,
  VARIABLES as APP_VARIABLES,
} from '../../packages/platform/src/config/schema.ts';

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

/**
 * The disposable placeholder for each application variable, in the order a developer reads them.
 *
 * A variable with a declared default uses that default. A secret is a local placeholder, never a
 * real credential. Adding a variable to the schema without an entry here fails this module's own
 * check at load, so `.env.example` cannot silently omit it.
 */
const LOCAL_EXAMPLES = {
  DATABASE_URL: 'postgresql://odp_local:odp_local_dev_password@127.0.0.1:5433/odp_local',
  REDIS_URL: 'redis://127.0.0.1:6380',
  S3_ENDPOINT: 'http://127.0.0.1:9100',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'odp-local',
  S3_ACCESS_KEY_ID: 'odp-local-access-key',
  S3_SECRET_ACCESS_KEY: 'odp-local-secret-key',
  S3_FORCE_PATH_STYLE: 'true',
  // A disposable 32-byte key. A real key lives in the managed secret store (NFR-024).
  STAFF_TOTP_SECRET_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  // The local operator's one-time seed password (operations.md Staff sign-in). A real deployment
  // value never lives here.
  STAFF_OPERATOR_INITIAL_PASSWORD: 'odp-local-operator-password',
  // The seeded response-staff member's one-time password. Disposable, like the operator's.
  STAFF_RESPONSE_STAFF_INITIAL_PASSWORD: 'odp-local-response-password',
  SMS_PROVIDER: 'none',
  SMS_API_URL: 'https://sms-gateway.example.test/send',
  SMS_API_KEY: 'local-sms-placeholder',
  SMS_SENDER_ID: 'ODP',
  MODEL_PROVIDER: 'none',
  MODEL_API_URL: 'https://model-gateway.example.test/v1',
  MODEL_API_KEY: 'local-model-placeholder',
  MODEL_REGION: 'ng',
  MODEL_VERSION_SIMILAR_SUBMISSION: 'odp-local-sim-1',
  MODEL_VERSION_WARD_CANDIDATE: 'odp-local-ward-1',
  MODEL_VERSION_MODERATION_ROUTING: 'odp-local-route-1',
  MODEL_VERSION_BUDGET_LINE_EXTRACTION: 'odp-local-budget-1',
};

/** The application variables, keyed by name, for the entries this module orders. */
const APP_BY_NAME = new Map(APP_VARIABLES.map((variable) => [variable.name, variable]));

/**
 * Turn one schema declaration into a local contract entry.
 *
 * @param {string} name - The variable name.
 * @returns {{ name: string, group: string, description: string, secret: boolean, example: string, spec: object }}
 */
function appEntry(name) {
  const spec = APP_BY_NAME.get(name);
  if (spec === undefined) throw new Error(`environment contract names an unknown variable ${name}`);
  const example = LOCAL_EXAMPLES[name] ?? spec.default;
  if (example === undefined) {
    throw new Error(`environment contract needs a local placeholder for ${name}`);
  }
  return {
    name,
    group: spec.group,
    description: spec.description,
    secret: spec.secret,
    example,
    spec,
  };
}

/**
 * A local-only entry: a variable Docker Compose reads rather than the application.
 *
 * @param {{ name: string, group: string, description: string, secret: boolean, example: string, spec: object }} input
 */
function localEntry(input) {
  return { ...input };
}

/** Every application variable in one group, in schema order. */
function appGroup(group) {
  return APP_VARIABLES.filter((variable) => variable.group === group).map((variable) =>
    appEntry(variable.name),
  );
}

/** A port the local stack publishes. */
const portSpec = { kind: 'integer', min: 1, max: 65535, required: true };

/** The variables, in the order `.env.example` renders them. */
export const VARIABLES = [
  appEntry('DATABASE_URL'),
  localEntry({
    name: 'POSTGRES_USER',
    group: 'postgres',
    description: 'Role the local PostgreSQL container creates and DATABASE_URL connects as.',
    secret: false,
    example: 'odp_local',
    spec: { kind: 'identifier', required: true },
  }),
  localEntry({
    name: 'POSTGRES_PASSWORD',
    group: 'postgres',
    description:
      'Password for that role. A local placeholder only; a real secret never lives here.',
    secret: true,
    example: 'odp_local_dev_password',
    spec: { kind: 'text' },
  }),
  localEntry({
    name: 'POSTGRES_DB',
    group: 'postgres',
    description: 'Database the container creates on first start.',
    secret: false,
    example: 'odp_local',
    spec: { kind: 'identifier', required: true },
  }),
  localEntry({
    name: 'POSTGRES_PORT',
    group: 'postgres',
    description:
      'Host port the container publishes; DATABASE_URL must use it. Off the standard 5432 so a PostgreSQL already installed here keeps its port.',
    secret: false,
    example: '5433',
    spec: portSpec,
  }),

  appEntry('REDIS_URL'),
  localEntry({
    name: 'REDIS_PORT',
    group: 'redis',
    description:
      'Host port the container publishes; REDIS_URL must use it. Off the standard 6379 so a Redis already installed here keeps its port.',
    secret: false,
    example: '6380',
    spec: portSpec,
  }),

  ...appGroup('session'),
  ...appGroup('credentials'),
  ...appGroup('limits'),

  ...appGroup('cache'),

  ...appGroup('storage'),
  localEntry({
    name: 'S3_PORT',
    group: 'storage',
    description:
      'Host port the object store publishes; S3_ENDPOINT must use it. Off the common 9000 so another local store keeps its port.',
    secret: false,
    example: '9100',
    spec: portSpec,
  }),

  ...appGroup('sms'),
  ...appGroup('model'),
  ...appGroup('flags'),
  ...appGroup('worker'),
];

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
 * Validators for the local-only declarations. Application variables go through the schema's own
 * `parseVariable`, so there is one implementation of every rule that matters.
 *
 * @type {Record<string, (value: string) => string | null>}
 */
const LOCAL_CHECKERS = {
  identifier(value) {
    return DB_IDENTIFIER.test(value)
      ? null
      : 'must be lower case letters, digits or underscores, and not start with a digit';
  },
};

/**
 * Validate one raw value against its declaration.
 *
 * @param {{ kind: string }} spec - The schema declaration, or a local-only stand-in.
 * @param {string} raw - The candidate value.
 * @returns {string | null} The reason it is refused, or null when it is acceptable.
 */
function problemFor(spec, raw) {
  if (spec.kind === 'identifier') return LOCAL_CHECKERS.identifier(raw);
  const parsed = parseVariable(spec, raw);
  return parsed.ok ? null : parsed.problem;
}

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
      `${variable} reaches a port that is not ${portVariable}; they must describe the same local service`,
    );
  }
}

/**
 * The cross-field checks that catch an environment edited in two places and drifted.
 *
 * They run only when every variable passed its own check, and only against a loopback host: a URL
 * that points at another host is not this stack's business. No message quotes a value.
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
      problems.push('DATABASE_URL must name the database POSTGRES_DB declares');
    }

    const role = decodeURIComponent(database.username);
    if (role !== values.POSTGRES_USER) {
      problems.push('DATABASE_URL must connect as POSTGRES_USER declares');
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
      const required =
        variable.spec.required === true ||
        (typeof variable.spec.requiredWhen === 'function' && variable.spec.requiredWhen(merged));
      if (required) problems.push(`${variable.name} is not set`);
      continue;
    }
    const problem = problemFor(variable.spec, raw);
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
 * schema validates.
 *
 * @returns {string} The full example file, ending in a newline.
 */
export function renderExample() {
  const lines = [
    '# Oyo Digital Parliament - local development environment.',
    '#',
    '# Rendered from `infra/local/environment.mjs`, whose application variables come from',
    '# `packages/platform/src/config/schema.ts`. Change the schema or the contract there and run',
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
      lines.push('', `# ${GROUP_HEADINGS[variable.group] ?? variable.group}`);
      currentGroup = variable.group;
    }
    lines.push(`# ${variable.description}`);
    lines.push(`${variable.name}=${variable.example}`);
  }

  return `${lines.join('\n')}\n`;
}
