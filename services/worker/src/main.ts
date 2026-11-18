/**
 * The worker entry point (`services/worker/AGENTS.md` Structure: `src/main.ts`).
 *
 * Boot order is deliberate: read configuration, create the logger, start the probe listener, install
 * signal handlers. The probe comes up before any scheduled work so the orchestrator can see readiness,
 * and the signal handlers come last so a `SIGTERM` during boot still drains cleanly.
 *
 * The scheduler and the six job directories land in later phases; they receive their batch lifecycle
 * from `runtime/shutdown.ts`, which is why the controller is created here rather than inside a job.
 * This file starts no job of its own.
 *
 * Configuration is read once, from the environment, and never printed. A missing `DATABASE_URL` fails
 * boot with the variable's name, never its value (`NFR-024`). `WORKER_PORT` defaults to 3001 and is the
 * worker's own listener, separate from the web deployable.
 */
import { pathToFileURL } from 'node:url';
import { createDatastoreCheck } from './runtime/datastore.ts';
import { createProbeServer, type ProbeServer } from './runtime/health.ts';
import { createJsonLogger, type Logger } from './runtime/log.ts';
import {
  createShutdownController,
  installShutdownSignals,
  type ShutdownController,
} from './runtime/shutdown.ts';

/** Default probe port for the worker's own listener. */
export const DEFAULT_WORKER_PORT = 3001;

/** Default time a running batch has after `SIGTERM` before its lock is released. */
export const DEFAULT_SHUTDOWN_GRACE_MS = 10_000;

/** The validated boot configuration. */
export interface WorkerConfig {
  readonly port: number;
  readonly host: string;
  readonly databaseUrl: string;
  readonly graceMs: number;
}

/** A running worker, as a test or a supervisor sees it. */
export interface RunningWorker {
  readonly logger: Logger;
  readonly controller: ShutdownController;
  readonly probes: ProbeServer;
  readonly port: number;
  /** Drains, closes the listener and exits through the controller. */
  stop(reason?: string): Promise<void>;
}

/** Reads a bounded integer from the environment, naming the variable when it is malformed. */
function readInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }
  return value;
}

/**
 * Reads and validates the worker's configuration.
 *
 * @param env - The process environment, injected so the read is provable without mutating `process`.
 * @throws When `DATABASE_URL` is missing or a numeric setting is out of range.
 */
export function readWorkerConfig(env: NodeJS.ProcessEnv): WorkerConfig {
  const databaseUrl = env['DATABASE_URL'];
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required; the worker cannot serve readiness without it.');
  }
  const port = readInteger(env, 'WORKER_PORT', DEFAULT_WORKER_PORT, 1, 65_535);
  const graceMs = readInteger(
    env,
    'WORKER_SHUTDOWN_GRACE_MS',
    DEFAULT_SHUTDOWN_GRACE_MS,
    0,
    300_000,
  );
  return {
    port,
    host: env['WORKER_HOST'] ?? '0.0.0.0',
    databaseUrl,
    graceMs,
  };
}

/**
 * Starts the worker's probe listener and shutdown machinery.
 *
 * @param config - The validated boot configuration.
 * @param options - Optional logger and exit seams, used by a test.
 */
export async function startWorker(
  config: WorkerConfig,
  options: { readonly logger?: Logger; readonly exit?: (code: number) => void } = {},
): Promise<RunningWorker> {
  const logger = options.logger ?? createJsonLogger();
  const probeHolder: { server?: ProbeServer } = {};
  const controller = createShutdownController({
    logger,
    graceMs: config.graceMs,
    onDrained: async () => {
      await probeHolder.server?.stop();
    },
    ...(options.exit === undefined ? {} : { exit: options.exit }),
  });
  const probes = createProbeServer({
    port: config.port,
    host: config.host,
    controller,
    checkDatastore: createDatastoreCheck(config.databaseUrl),
    logger,
  });
  probeHolder.server = probes;

  const port = await probes.start();
  controllerLogStarted(logger, port);

  return {
    logger,
    controller,
    probes,
    port,
    stop: (reason = 'requested') => controller.stop(reason),
  };
}

/** One line proving the listener is up, without the host name or any credential. */
function controllerLogStarted(logger: Logger, port: number): void {
  logger.info('worker.started', { port });
}

/** Boots from the real environment and installs the signal handlers. */
async function main(): Promise<void> {
  const logger = createJsonLogger();
  try {
    loadLocalEnvironment();
    const config = readWorkerConfig(process.env);
    const worker = await startWorker(config, { logger });
    installShutdownSignals({ controller: worker.controller, logger });
  } catch (error) {
    logger.error('worker.boot_failed', { error });
    process.exitCode = 1;
  }
}

/**
 * Loads the repository `.env` when the process was started without one.
 *
 * `next start` reads `.env` itself; the worker runs under plain `node`, so the local development
 * stack's values would otherwise be invisible. A deployed container sets its variables in the
 * environment and has no `.env`; a missing file is therefore not an error. Values already present in
 * `process.env` win, which is what lets CI and production override the file.
 */
function loadLocalEnvironment(): void {
  if (process.env['DATABASE_URL'] !== undefined) return;
  try {
    process.loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch {
    // No local file: the container environment is the source.
  }
}

// Start only when this file is the process entry point, so importing it in a test does not boot.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
