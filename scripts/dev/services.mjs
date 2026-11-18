#!/usr/bin/env node
/**
 * Control the disposable local services the whole workspace develops against.
 *
 *   node scripts/dev/services.mjs up       create `.env` if missing, validate it, start the stack
 *   node scripts/dev/services.mjs down     stop the stack and keep its data
 *   node scripts/dev/services.mjs reset    destroy the stack's containers and volumes, start it empty
 *   node scripts/dev/services.mjs status   show each service and its health
 *   node scripts/dev/services.mjs logs [service...]   follow the stack's logs
 *
 * `up` starts PostgreSQL 16, Redis 7 and an S3-compatible object store from `docker-compose.yml`,
 * waits for every health check, and creates the private bucket. The Development environment holds
 * synthetic data and resets freely (`architecture.md` Environments); `reset` exists so that promise
 * is one command and cannot touch anything else.
 *
 * The Compose project name is fixed in `infra/local/environment.mjs` and passed explicitly to every
 * Docker call. `reset` therefore removes only the `odp-local` project's containers and its named
 * volumes, never another project on the machine, never a file outside Docker, and never a remote
 * environment. The database, cache and bucket are reached through the one `.env`, which both the app
 * and the worker are configured from.
 *
 * Every command except `logs` validates the environment first and refuses to call Docker when it is
 * invalid, so a missing variable is reported by name before anything starts.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPOSE_PROJECT_NAME,
  ENV_FILE_NAME,
  EXAMPLE_FILE_NAME,
  loadEnvironment,
  renderExample,
} from '../../infra/local/environment.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const composeFile = join(repoRoot, 'docker-compose.yml');
const envPath = join(repoRoot, ENV_FILE_NAME);
const examplePath = join(repoRoot, EXAMPLE_FILE_NAME);

const USAGE = `Usage:
  node scripts/dev/services.mjs up       Start PostgreSQL 16, Redis 7 and object storage.
  node scripts/dev/services.mjs down     Stop the stack; named volumes are kept.
  node scripts/dev/services.mjs reset --yes
                                        Destroy the odp-local containers and volumes, then
                                        recreate the stack empty. Without --yes it only explains.
  node scripts/dev/services.mjs status   Show each service and its health.
  node scripts/dev/services.mjs logs [service...]
                                        Follow the logs (Ctrl-C stops following, not the stack).

The stack is disposable local data only. Both the app and the worker read ${ENV_FILE_NAME}.`;

/**
 * Stop the command with a message, after Docker has printed its own output.
 *
 * @param {string} message - What happened and what to do about it.
 * @returns {never} Never returns.
 */
function fail(message) {
  console.error(`services: ${message}`);
  process.exit(1);
}

/**
 * Run `docker compose` against this repository's file and project.
 *
 * The project name is passed on every call rather than read from the environment; a stray
 * `COMPOSE_PROJECT_NAME` must not be able to redirect a reset onto somebody else's stack.
 *
 * @param {string[]} args - Arguments after `docker compose`.
 * @param {{ capture?: boolean }} [options] - Capture stdout and stderr instead of inheriting them.
 * @returns {import("node:child_process").SpawnSyncReturns<string>} The finished process.
 */
function compose(args, { capture = false } = {}) {
  const result = spawnSync(
    'docker',
    [
      'compose',
      '--project-name',
      COMPOSE_PROJECT_NAME,
      '--file',
      composeFile,
      '--env-file',
      envPath,
      ...args,
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    },
  );

  if (result.error) {
    if (/** @type {NodeJS.ErrnoException} */ (result.error).code === 'ENOENT') {
      fail(
        'docker was not found on PATH; install Docker Desktop, or the Docker Engine with the Compose v2 plugin',
      );
    }
    fail(`could not run docker: ${result.error.message}`);
  }

  return result;
}

/**
 * Create `.env` from `.env.example` when it is missing, so the first run of `up` is one command.
 *
 * The created file holds disposable placeholders only; it is git-ignored, and the notice says so.
 *
 * @returns {void}
 */
function ensureEnvFile() {
  if (existsSync(envPath)) {
    return;
  }
  const example = existsSync(examplePath) ? readFileSync(examplePath, 'utf8') : renderExample();
  writeFileSync(envPath, example);
  console.log(
    `services: ${ENV_FILE_NAME} did not exist; wrote it from ${EXAMPLE_FILE_NAME}. Local placeholders only.`,
  );
}

/**
 * Validate the environment, or stop before anything touches Docker.
 *
 * @returns {Record<string, string>} The validated values, used only for the endpoint summary.
 */
function requireEnvironment() {
  const result = loadEnvironment({ filePath: envPath });
  if (result.fileMissing) {
    fail(`${ENV_FILE_NAME} is missing and could not be created; run "up" first`);
  }
  if (result.problems.length > 0) {
    for (const problem of result.problems) {
      console.error(`services: ${problem}`);
    }
    fail(`the environment is not valid; fix ${ENV_FILE_NAME} and try again (nothing was started)`);
  }
  return result.values;
}

/**
 * Print the endpoints, never a credential.
 *
 * @param {Record<string, string>} values - The validated environment.
 * @returns {void}
 */
function printEndpoints(values) {
  console.log('');
  console.log('Local services are up (disposable, synthetic data only):');
  console.log(
    `  PostgreSQL 16   127.0.0.1:${values.POSTGRES_PORT}   database ${values.POSTGRES_DB}`,
  );
  console.log(`  Redis 7         127.0.0.1:${values.REDIS_PORT}`);
  console.log(
    `  Object storage  127.0.0.1:${values.S3_PORT}   bucket ${values.S3_BUCKET} (S3-compatible, private)`,
  );
  console.log('');
  console.log(
    `  ${ENV_FILE_NAME} is the one environment the app and the worker are configured from.`,
  );
  console.log('  Stop: node scripts/dev/services.mjs down');
  console.log('  Reset: node scripts/dev/services.mjs reset --yes');
  console.log('');
}

/**
 * Parse `docker compose ps --format json`.
 *
 * Compose emits one JSON object per line (NDJSON); older builds emit a single array. Accept both so
 * a Compose upgrade cannot break the status table or the "already running" guard.
 *
 * @param {string} stdout - The captured output.
 * @returns {Array<Record<string, unknown>>} The rows.
 */
function parseComposeRows(stdout) {
  const text = (stdout ?? '').trim();
  if (text === '') {
    return [];
  }
  if (text.startsWith('[')) {
    return JSON.parse(text);
  }
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line));
}

/**
 * Whether a host port can be bound. The probe binds only the loopback address, exactly as the
 * Compose stack does, so it reports the same conflict Docker would.
 *
 * @param {string} port - The port to probe.
 * @returns {Promise<boolean>} True when nothing holds the port.
 */
function isPortFree(port) {
  return new Promise((resolveProbe) => {
    const server = createServer();
    server.once('error', () => {
      resolveProbe(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolveProbe(true);
      });
    });
    server.listen({ host: '127.0.0.1', port: Number(port), exclusive: true });
  });
}

/**
 * Report a host port that another process already holds, naming the variable rather than only the
 * port, before Docker starts and fails with a message about "port is already allocated".
 *
 * The check is skipped when the stack is already up: those ports belong to this project.
 *
 * @param {Record<string, string>} values - The validated environment.
 * @returns {Promise<void>} Rejects the command on a conflict.
 */
async function assertPortsAvailable(values) {
  const status = compose(['ps', '--status', 'running', '--format', 'json'], { capture: true });
  try {
    if (parseComposeRows(status.stdout).length > 0) {
      return;
    }
  } catch {
    // An unreadable status is not a reason to block the start; Docker reports a real conflict below.
  }

  /** @type {Array<[string, string]>} */
  const probes = [
    ['POSTGRES_PORT', values.POSTGRES_PORT],
    ['REDIS_PORT', values.REDIS_PORT],
    ['S3_PORT', values.S3_PORT],
  ];

  /** @type {string[]} */
  const busy = [];
  for (const [variable, port] of probes) {
    if (!(await isPortFree(port))) {
      busy.push(`${variable} (${port})`);
    }
  }

  if (busy.length > 0) {
    fail(
      `these host ports are already in use: ${busy.join(', ')}. Change the port in ${ENV_FILE_NAME}, change the matching URL with it, and run up again`,
    );
  }
}

/**
 * `up`: validate, check the host ports, start, wait for health, create the bucket, report.
 *
 * @returns {Promise<void>}
 */
async function up() {
  ensureEnvFile();
  const values = requireEnvironment();

  await assertPortsAvailable(values);

  console.log('services: starting the local stack...');
  const started = compose(['up', '--detach', '--wait', '--wait-timeout', '180']);
  if (started.status !== 0) {
    console.error('services: the stack did not become healthy; recent logs:');
    compose(['logs', '--tail', '40']);
    fail('fix the service above, then run "up" again');
  }

  // The bucket bootstrap is a one-shot container behind the `init` profile, so `up --wait` does not
  // wait on a process that exits by design. It is idempotent: a second run finds the bucket.
  const bootstrapped = compose([
    '--profile',
    'init',
    'run',
    '--rm',
    '--no-deps',
    '--no-TTY',
    'object-storage-init',
  ]);
  if (bootstrapped.status !== 0) {
    fail('the private object-storage bucket could not be created; see the output above');
  }

  printEndpoints(values);
}

/**
 * `down`: stop the stack and keep its data.
 *
 * @returns {void}
 */
function down() {
  ensureEnvFile();
  requireEnvironment();
  if (compose(['down']).status !== 0) {
    fail('the stack could not be stopped cleanly; see the output above');
  }
  console.log('services: stopped; named volumes were kept.');
}

/**
 * `reset`: destroy this project's containers and named volumes, then recreate the stack empty.
 *
 * @param {boolean} confirmed - Whether `--yes` was passed.
 * @returns {Promise<number>} The exit code.
 */
async function reset(confirmed) {
  if (!confirmed) {
    console.log('services: reset destroys the odp-local Compose project: its containers and the');
    console.log('services: named volumes postgres-data, redis-data and object-storage-data.');
    console.log(
      'services: Nothing outside that project is touched. Re-run with --yes to continue;',
    );
    console.log('services: `down` stops the stack without deleting anything.');
    return 1;
  }

  ensureEnvFile();
  requireEnvironment();

  const destroyed = compose(['down', '--volumes', '--remove-orphans']);
  if (destroyed.status !== 0) {
    fail('the stack could not be destroyed; see the output above');
  }
  console.log('services: local data destroyed; recreating the stack empty.');
  await up();
  return 0;
}

/**
 * `status`: show each service and its health, or say that nothing is running.
 *
 * @returns {void}
 */
function status() {
  ensureEnvFile();
  const values = requireEnvironment();

  const result = compose(['ps', '--all', '--format', 'json'], { capture: true });
  if (result.status !== 0) {
    fail('the stack state could not be read; see the output above');
  }

  /** @type {Array<{ Service?: string, State?: string, Health?: string }>} */
  let rows;
  try {
    rows = parseComposeRows(result.stdout);
  } catch {
    process.stdout.write(result.stdout);
    return;
  }

  if (rows.length === 0) {
    console.log('services: the stack has no containers; run "node scripts/dev/services.mjs up"');
    return;
  }

  console.log('Service            State');
  for (const row of rows) {
    const service = (row.Service ?? 'unknown').padEnd(18);
    const health = row.Health === undefined || row.Health === '' ? '' : ` (${row.Health})`;
    console.log(`${service} ${row.State ?? 'unknown'}${health}`);
  }
  console.log('');
  console.log(
    `Endpoints: PostgreSQL 127.0.0.1:${values.POSTGRES_PORT}, Redis 127.0.0.1:${values.REDIS_PORT}, object storage 127.0.0.1:${values.S3_PORT}`,
  );
}

/**
 * `logs`: follow the stack's logs.
 *
 * @param {string[]} services - Optional service names to narrow the output.
 * @returns {void}
 */
function logs(services) {
  ensureEnvFile();
  const result = compose(['logs', '--follow', '--tail', '100', ...services]);
  if (result.status !== 0 && result.status !== null) {
    process.exitCode = result.status;
  }
}

/**
 * Entry point.
 *
 * @param {string[]} argv - The arguments after the script name.
 * @returns {Promise<number>} The exit code.
 */
async function main(argv) {
  const [command, ...rest] = argv;

  switch (command) {
    case 'up':
      await up();
      return 0;
    case 'down':
      down();
      return 0;
    case 'reset':
      return reset(rest.includes('--yes') || rest.includes('-y'));
    case 'status':
      status();
      return 0;
    case 'logs':
      logs(rest.filter((argument) => !argument.startsWith('-')));
      return 0;
    case undefined:
    case '-h':
    case '--help':
    case 'help':
      console.log(USAGE);
      return 0;
    default:
      console.error(`services: unknown command "${command}"`);
      console.error(USAGE);
      return 2;
  }
}

process.exitCode = await main(process.argv.slice(2));
