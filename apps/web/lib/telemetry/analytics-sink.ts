/**
 * The durable analytics sink this deployable writes through (`C-077` operation `analytics.emit`,
 * `C-089`, `analytics.md` Analytics Data Governance).
 *
 * The dispatcher knows only that it has a `TelemetrySink`: something that takes a validated envelope
 * and answers with the instant it was stored, or throws. `packages/db` owns the store itself — the
 * `analytics_event` table, the idempotent insert and the deletion propagation — and this module is
 * the seam between the two, so `apps/web` composes a durable sink without reaching into the database
 * package's internals.
 *
 * The adapter adds nothing to the envelope. It does not re-time, re-identify or re-payload an event:
 * a field this layer invented would be a field `C-089` does not declare, and validation would refuse
 * it. A store refusal propagates unchanged, which is what the dispatcher buffers and reports as
 * `NOT_STORED`.
 */
import type { AnalyticsStorePort } from '@odp/domain';
import type { TelemetrySink } from './dispatcher';

/**
 * Adapts the analytics store port to the dispatcher's sink.
 *
 * @param store - The durable store, normally `createAnalyticsEventRepository(database.db)`.
 */
export function createDurableAnalyticsSink(store: AnalyticsStorePort): TelemetrySink {
  return {
    async emit(request) {
      return store.emit(request);
    },
  };
}
