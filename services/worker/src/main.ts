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
 * Configuration is read once through the platform loader, from the environment, and never printed. A
 * missing `DATABASE_URL` fails boot with the variable's name, never its value (`NFR-024`).
 * `WORKER_PORT`, `WORKER_HOST` and `WORKER_SHUTDOWN_GRACE_MS` are declared once in the platform schema
 * and are the worker's own listener, separate from the web deployable (`C-091`).
 */
import { pathToFileURL } from 'node:url';
import { loadConfig } from '@odp/platform';
import { createDatastoreCheck } from './runtime/datastore.ts';
import { createProbeServer, type ProbeServer } from './runtime/health.ts';
import { createJsonLogger, type Logger } from './runtime/log.ts';
import {
  createShutdownController,
  installShutdownSignals,
  type ShutdownController,
} from './runtime/shutdown.ts';

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

/** Reads the worker settings from the one validated platform configuration. */
function workerConfigFromPlatform(): WorkerConfig {
  const config = loadConfig();
  return {
    port: config.worker.port,
    host: config.worker.host,
    databaseUrl: config.databaseUrl,
    graceMs: config.worker.shutdownGraceMs,
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
    const config = workerConfigFromPlatform();
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
