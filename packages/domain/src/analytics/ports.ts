/**
 * The effects the analytics module cannot perform itself (`C-077`, `C-089`).
 *
 * These interfaces are declared here, beside the rules that need them, because `src/ports/` belongs
 * to the phase-0 infrastructure task (F0-10) and this module must compile without it. They are
 * structural, so the adapters in `packages/platform` and `packages/db` satisfy them without importing
 * this file; whoever owns `src/ports/` can re-export them from there.
 */
import type { AnalyticsEmitRequest } from './envelope.ts';

/**
 * Append one validated event to the analytics store.
 *
 * A rejection (unreachable store, quota, a full buffer) must reject the returned promise or throw.
 * The caller decides what that means: `C-089` buffers and retries rather than failing the write that
 * produced the event.
 */
export interface AnalyticsStorePort {
  /**
   * Append one validated event and return the instant it was stored, which `C-089` echoes back as
   * `storedAt`.
   *
   * @throws when the event could not be stored.
   */
  emit(request: AnalyticsEmitRequest): Promise<{ readonly storedAt: string }>;

  /**
   * Replace every occurrence of a member's pseudonymous id with a token that cannot be reversed.
   *
   * This is `analytics.md` deletion propagation: historical counts survive, the events stop being
   * attributable. It must be idempotent, because a data request is retried until it confirms.
   */
  replaceUserToken(userId: string, token: string): Promise<{ readonly replaced: number }>;
}

/**
 * Derive the non-reversible token that replaces a member id.
 *
 * Derivation lives outside the domain because it needs a keyed hash and the domain holds no crypto
 * and no configuration. The adapter must be deterministic for one input so a retried deletion request
 * replaces the id with the same token rather than creating a second unattributable identity.
 */
export interface PseudonymTokenPort {
  derive(userId: string): Promise<string>;
}
