/**
 * Graceful shutdown and batch bookkeeping for the worker (`C-091`, `services/worker/AGENTS.md`
 * Discipline: "The lock is in the database, and shutdown respects it").
 *
 * A scheduled job registers the batch it holds and the release path for its advisory lock. On
 * `SIGTERM` the controller:
 *
 * 1. marks the process draining, so `/readyz` answers `503` before the listener closes;
 * 2. waits for the batches already running to finish, up to a fixed grace period;
 * 3. releases the lock of anything still running when the period expires, so a killed batch does not
 *    hold its scope until the database notices the connection died;
 * 4. closes the probe listener and exits.
 *
 * A batch that finishes inside the period is never released by the controller; the job's own `finally`
 * path releases its lock once, which is the normal case. Registration is refused while draining, so a
 * shutdown never starts new work.
 */
import type { Logger } from './log.ts';

/** The slice of a running batch the controller needs. */
export interface BatchLease {
  /** An opaque run identifier, safe to log. */
  readonly id: string;
  /** Releases the database advisory lock. Idempotent; may be synchronous. */
  release(): void | Promise<void>;
}

/** What a job receives for one batch. Calling `complete` twice is harmless. */
export interface BatchRegistration {
  complete(): void;
}

/** The shutdown surface. */
export interface ShutdownController {
  /** True once shutdown has begun; the probe reports `not_ready`. */
  isDraining(): boolean;
  /** @returns True when this call made the transition. */
  beginDrain(reason: string): boolean;
  /** Registers a batch. Throws `WORKER_DRAINING` when shutdown has already begun. */
  registerBatch(lease: BatchLease): BatchRegistration;
  /** Resolves when no batch is registered. */
  whenIdle(): Promise<void>;
  /** Drains, releases stragglers, closes the listener and exits. Safe to call twice. */
  stop(reason: string): Promise<void>;
}

/** Everything the controller needs. */
export interface ShutdownOptions {
  readonly logger: Logger;
  /** How long running batches have before their locks are released. */
  readonly graceMs: number;
  /** Closes the probe listener; awaited before exit. */
  readonly onDrained?: () => void | Promise<void>;
  /** Exit seam, so a test can observe the code without ending the test process. */
  readonly exit?: (code: number) => void;
}

/** The signal source, injectable for a test. */
export interface SignalSource {
  on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  off(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
}

/** Waits for `idle`, returning early with `false` when the grace period expires. */
function waitUpTo(idle: Promise<void>, graceMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, graceMs);
    void idle.then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * Creates the worker's shutdown controller.
 *
 * @param options - The logger, grace period and the exit/close seams.
 */
export function createShutdownController(options: ShutdownOptions): ShutdownController {
  const active = new Map<string, BatchLease>();
  const idleWaiters: Array<() => void> = [];
  let draining = false;
  let stopping: Promise<void> | null = null;

  const resolveIdle = (): void => {
    if (active.size > 0) return;
    for (const waiter of idleWaiters.splice(0)) waiter();
  };

  const releaseRemaining = async (): Promise<void> => {
    const remaining = [...active.values()];
    active.clear();
    for (const lease of remaining) {
      try {
        await lease.release();
        options.logger.warn('worker.batch.released', { batchId: lease.id });
      } catch (error) {
        options.logger.error('worker.batch.release_failed', { batchId: lease.id, error });
      }
    }
    resolveIdle();
  };

  const finish = async (): Promise<void> => {
    if (options.onDrained !== undefined) {
      try {
        await options.onDrained();
      } catch (error) {
        options.logger.error('worker.shutdown.listener_close_failed', { error });
      }
    }
    (options.exit ?? ((code: number) => process.exit(code)))(0);
  };

  const controller: ShutdownController = {
    isDraining: () => draining,

    beginDrain(reason) {
      if (draining) return false;
      draining = true;
      options.logger.info('worker.draining', { reason, activeBatches: active.size });
      return true;
    },

    registerBatch(lease) {
      if (draining) {
        const error = new Error('The worker is draining and cannot start a batch.');
        (error as Error & { code?: string }).code = 'WORKER_DRAINING';
        throw error;
      }
      active.set(lease.id, lease);
      return {
        complete() {
          active.delete(lease.id);
          resolveIdle();
        },
      };
    },

    whenIdle() {
      if (active.size === 0) return Promise.resolve();
      return new Promise<void>((resolve) => idleWaiters.push(resolve));
    },

    stop(reason) {
      if (stopping !== null) return stopping;
      controller.beginDrain(reason);
      stopping = (async () => {
        if (active.size > 0) {
          const finished = await waitUpTo(controller.whenIdle(), options.graceMs);
          if (!finished) {
            options.logger.warn('worker.draining.grace_expired', {
              graceMs: options.graceMs,
              activeBatches: active.size,
            });
            await releaseRemaining();
          }
        }
        await finish();
      })();
      return stopping;
    },
  };

  return controller;
}

/**
 * Installs `SIGTERM` and `SIGINT` handlers that stop the controller.
 *
 * @param options - The controller, logger and injectable process/exit seams.
 * @returns A cleanup function that removes both listeners.
 */
export function installShutdownSignals(options: {
  readonly controller: ShutdownController;
  readonly logger: Logger;
  readonly signals?: SignalSource;
  readonly exit?: (code: number) => void;
}): () => void {
  const signals = options.signals ?? process;
  const exit = options.exit ?? ((code: number) => process.exit(code));

  const handler = (): void => {
    if (options.controller.isDraining()) {
      // A second signal means the operator is not waiting for the grace period.
      exit(1);
      return;
    }
    void options.controller.stop('signal');
  };

  signals.on('SIGTERM', handler);
  signals.on('SIGINT', handler);

  return () => {
    signals.off('SIGTERM', handler);
    signals.off('SIGINT', handler);
  };
}
