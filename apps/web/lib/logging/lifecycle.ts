/**
 * Draining state and graceful shutdown for the web deployable (`C-091`).
 *
 * `C-091` requires `/readyz` to turn `503` *before* the listener closes, so the reverse proxy stops
 * routing to an instance while that instance is still able to answer. This module owns the flag the
 * readiness handler reads, and the signal listeners that set it.
 *
 * The process is given a grace period to finish the requests already accepted. A second signal is
 * treated as an operator insisting, and exits immediately rather than waiting out the same period
 * again. The module holds no request data and writes no state beyond the boolean.
 */
import type { Logger } from './logger';

/** The read side of the drain flag, plus the transition that sets it. */
export interface DrainController {
  /** True once shutdown has begun; `/readyz` answers `503` from this point. */
  isDraining(): boolean;
  /** @returns True when this call made the transition, false when it was already draining. */
  beginDrain(reason: string): boolean;
}

/**
 * Creates an independent drain controller.
 *
 * The application uses the module-level {@link webDrain}; a test creates its own so one test cannot
 * leave the next one draining.
 */
export function createDrainController(): DrainController {
  let draining = false;
  return {
    isDraining: () => draining,
    beginDrain() {
      if (draining) return false;
      draining = true;
      return true;
    },
  };
}

/** The process-wide drain flag for the web deployable. */
export const webDrain: DrainController = createDrainController();

/** The slice of `process` the installer needs, so a test can supply a fake. */
export interface SignalSource {
  on(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
  off(signal: 'SIGTERM' | 'SIGINT', listener: () => void): unknown;
}

/** The timer functions the grace period uses, injectable for a test. */
export interface ShutdownTimers {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

const processTimers: ShutdownTimers = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Everything the installer needs. */
export interface ShutdownInstallerOptions {
  readonly drain: DrainController;
  readonly logger: Logger;
  /** How long in-flight requests have to finish before the process exits. */
  readonly graceMs: number;
  readonly signals?: SignalSource;
  readonly timers?: ShutdownTimers;
  readonly exit?: (code: number) => void;
}

/**
 * Installs `SIGTERM` and `SIGINT` handlers that drain and then exit.
 *
 * @param options - The drain flag, logger, grace period and the injectable process seams.
 * @returns A cleanup function that removes the listeners and cancels a pending exit.
 */
export function installShutdownHandlers(options: ShutdownInstallerOptions): () => void {
  const signals = options.signals ?? process;
  const timers = options.timers ?? processTimers;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let timer: unknown;

  const handler = (): void => {
    if (!options.drain.beginDrain('signal')) {
      // A second signal means the operator is not waiting for the grace period.
      exit(1);
      return;
    }
    options.logger.warn('lifecycle.draining', { graceMs: options.graceMs });
    timer = timers.schedule(() => exit(0), options.graceMs);
  };

  signals.on('SIGTERM', handler);
  signals.on('SIGINT', handler);

  return () => {
    signals.off('SIGTERM', handler);
    signals.off('SIGINT', handler);
    if (timer !== undefined) {
      timers.cancel(timer);
      timer = undefined;
    }
  };
}
