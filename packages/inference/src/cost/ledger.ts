/**
 * The spend ledger (`C-078`, `packages/inference/AGENTS.md` Discipline).
 *
 * Cost is a tripwire, not a report: spend is counted per capability in a fixed, aligned window, and
 * a capability whose window has reached its ceiling is refused with `RATE_LIMITED` before another
 * call is dispatched. A retry, a batch or a harness run therefore cannot spend past a tripped
 * capability, and the refusal carries the seconds left in the window.
 *
 * The ledger is process-local on purpose. It bounds one gateway's spend; a multi-instance
 * deployment pins each instance to its share of the ceiling rather than pretending to share a
 * counter (`NFR-045` names the provider, not a shared store).
 *
 * @module cost/ledger
 */
import type { CapabilityName } from '../gateway/contract.ts';

/** The answer to a pre-dispatch spend check. */
export type SpendCheck =
  { readonly allowed: true } | { readonly allowed: false; readonly retryAfterSeconds: number };

/** The ledger the gateway consults before every call. */
export interface CostLedger {
  /** @returns Whether the capability may spend again in this window. */
  check(capability: CapabilityName, ceilingMicrosPerThousand: number): SpendCheck;
  /** Adds one call's cost to the current window. */
  record(capability: CapabilityName, costMicros: number): void;
}

interface WindowEntry {
  windowStart: number;
  spentMicros: number;
}

/** Where the ledger's time comes from; injected so a test can move the window. */
export interface CostLedgerOptions {
  readonly now: () => number;
  readonly windowSeconds: number;
}

/**
 * Builds a fixed-window ledger.
 *
 * @param options - The clock and the window length in seconds.
 */
export function createCostLedger(options: CostLedgerOptions): CostLedger {
  const windowMs = options.windowSeconds * 1000;
  const entries = new Map<CapabilityName, WindowEntry>();

  function current(capability: CapabilityName): WindowEntry {
    const now = options.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const existing = entries.get(capability);
    if (existing === undefined || existing.windowStart !== windowStart) {
      const entry: WindowEntry = { windowStart, spentMicros: 0 };
      entries.set(capability, entry);
      return entry;
    }
    return existing;
  }

  return {
    check(capability, ceilingMicrosPerThousand): SpendCheck {
      const entry = current(capability);
      if (entry.spentMicros < ceilingMicrosPerThousand) return { allowed: true };
      const remainingMs = entry.windowStart + windowMs - options.now();
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)) };
    },

    record(capability, costMicros): void {
      if (costMicros <= 0) return;
      const entry = current(capability);
      entry.spentMicros += costMicros;
    },
  };
}
