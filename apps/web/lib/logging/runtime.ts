/**
 * Composition for the web deployable's operational baseline (`C-091`).
 *
 * One logger, one drain flag and one datastore check are shared by both probe routes, so the process
 * answers readiness from the same state its signal handler sets. The shutdown listeners are installed
 * once, when a probe route module first loads.
 *
 * `DATABASE_URL` is read here because the validated configuration loader in `packages/platform` has
 * not landed yet; this is the single read in the web area and it will be replaced by the loader
 * without changing the probe handlers.
 */
import { resolve } from 'node:path';
import { createDatastoreCheck } from './datastore';
import { installShutdownHandlers, webDrain } from './lifecycle';
import { createJsonLogger } from './logger';
import type { ProbeRuntime } from './probes';

/** How long an in-flight request has after `SIGTERM` before the process exits. */
export const WEB_SHUTDOWN_GRACE_MS = 10_000;

/**
 * Reads one environment variable without letting the bundler fold it into the server output.
 *
 * A `process.env.DATABASE_URL` expression is replaced with its build-time value by the Next compiler;
 * that would bake the database credential into the artifact and make a runtime change invisible. The
 * indirection keeps the read at runtime, which is where the value is known.
 */
function readEnvironment(name: string): string | undefined {
  const value: unknown = Reflect.get(globalThis.process.env, name);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/**
 * Loads the repository `.env` when the process was started without one.
 *
 * `next start` reads `.env` from the application directory; this monorepo's file is at the repository
 * root. The loader tries both, does nothing when the variable is already present (CI and a deployed
 * container win), and never fails boot on a missing file.
 */
function loadLocalEnvironment(): void {
  if (readEnvironment('DATABASE_URL') !== undefined) return;
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    try {
      process.loadEnvFile(candidate);
      if (readEnvironment('DATABASE_URL') !== undefined) return;
    } catch {
      // Try the next candidate; a missing local file is the normal deployed case.
    }
  }
}

if (process.env['NEXT_PHASE'] !== 'phase-production-build') loadLocalEnvironment();

const logger = createJsonLogger({ service: 'web' });

/** The runtime both probe handlers answer from. */
export const webProbeRuntime: ProbeRuntime = {
  drain: webDrain,
  checkDatastore: createDatastoreCheck({ databaseUrl: readEnvironment('DATABASE_URL') }),
  logger,
};

let installed = false;

/**
 * Installs the process signal handlers once.
 *
 * `next build` imports route modules in its build workers; a handler registered there would be dead
 * weight in a process that never serves traffic, so the production build phase is skipped.
 */
export function installWebShutdownHandlers(): void {
  if (installed || process.env['NEXT_PHASE'] === 'phase-production-build') return;
  installed = true;
  installShutdownHandlers({ drain: webDrain, logger, graceMs: WEB_SHUTDOWN_GRACE_MS });
}
