/**
 * The durable analytics sink (`C-089`, `C-077` operation `analytics.emit`, `analytics.md`,
 * `packages/db` Discipline).
 *
 * This is the store `apps/web`'s telemetry dispatcher writes through, and it is the deployment's
 * replacement for the refusing boundary stub: a validated envelope leaves the request as one row
 * instead of a buffered retry that never lands.
 *
 * Three properties only a store can keep:
 *
 * - **One row per event.** `event_id` is the primary key and the insert is
 *   `ON CONFLICT DO NOTHING`, so a replay from the dispatcher's retry buffer reports the instant the
 *   event was first stored rather than counting it twice. `C-089` echoes that instant as `storedAt`.
 * - **Nothing unvalidated reaches the table.** The port receives an `AnalyticsEmitRequest`, which is
 *   only produced by the domain's own validator, and the repository validates it again before the
 *   write. A payload carrying a name, a telephone number, a ward description or free text is refused
 *   here even if a caller bypassed the dispatcher.
 * - **Deletion propagation that survives a retry.** `analytics.replaceUserToken` rewrites the
 *   member's `user_id` to the derived token and reports how many events now carry that token, which
 *   is the same number on every attempt. A second attempt therefore confirms the replacement instead
 *   of issuing a second identity (`C-077`, `analytics.md` Deletion propagation).
 *
 * Retention is part of the row: `expires_at` is `occurred_at` plus the 26 months `nfr.md` fixes, so
 * the sweep that aggregates and removes an expired event reads one indexed column and needs no
 * clock of its own.
 */
import { count, eq } from 'drizzle-orm';
import {
  parseAnalyticsEmitRequest,
  type AnalyticsEmitRequest,
  type AnalyticsStorePort,
} from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { ANALYTICS_RETENTION_MONTHS, analyticsEvent } from '../schema/analytics-event.ts';

/** A `C-001` identifier, which is what both the member identity and the replacement token are. */
const IDENTIFIER_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;

/** One repository implements the store port; nothing else writes this table. */
export type AnalyticsEventRepository = AnalyticsStorePort;

/**
 * The retention instant of one event: its occurrence plus `ANALYTICS_RETENTION_MONTHS` months.
 *
 * Month arithmetic clamps to the last day of the target month (31 January plus one month is 28 or 29
 * February), so a stored instant is always a real date and no event is retained for a negative or
 * doubled period. Everything is UTC, as `C-001` fixes every exchanged instant.
 *
 * @param occurredAt - The envelope's `occurred_at`, in the `C-001` form.
 * @returns The expiry instant in the same form.
 */
export function analyticsRetentionInstant(occurredAt: string): string {
  const occurrence = new Date(occurredAt);
  const dayOfMonth = occurrence.getUTCDate();
  occurrence.setUTCDate(1);
  occurrence.setUTCMonth(occurrence.getUTCMonth() + ANALYTICS_RETENTION_MONTHS);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(occurrence.getUTCFullYear(), occurrence.getUTCMonth() + 1, 0),
  ).getUTCDate();
  occurrence.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return occurrence.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Builds the analytics sink bound to an executor.
 *
 * @param executor - The shared client, or a transaction when the caller stores an event inside a
 * wider write. Analytics is a low-criticality path, so the caller normally passes the client.
 */
export function createAnalyticsEventRepository(executor: Executor): AnalyticsEventRepository {
  const db = executorOf(executor);

  return {
    async emit(request: AnalyticsEmitRequest): Promise<{ readonly storedAt: string }> {
      const parsed = parseAnalyticsEmitRequest(request);
      if (!parsed.ok) {
        // The cause and field paths are stable tokens, so the report names no property value.
        throw new Error(
          `The analytics envelope was refused and is not stored: ${parsed.code}/${parsed.cause}`,
        );
      }
      const accepted = parsed.request;

      const inserted = await db
        .insert(analyticsEvent)
        .values({
          eventId: accepted.event_id,
          eventName: accepted.event_name,
          occurredAt: accepted.occurred_at,
          userId: accepted.user_id,
          anonymousId: accepted.anonymous_id,
          sessionId: accepted.session_id,
          platform: accepted.platform,
          appVersion: accepted.app_version,
          locale: accepted.locale,
          correlationId: accepted.correlation_id ?? null,
          properties: accepted.properties,
          expiresAt: analyticsRetentionInstant(accepted.occurred_at),
        })
        .onConflictDoNothing({ target: analyticsEvent.eventId })
        .returning({ storedAt: analyticsEvent.storedAt });

      const row = inserted[0];
      if (row !== undefined) return { storedAt: row.storedAt };

      // The event is already stored: this is the same event, not a second one. Report the instant it
      // was first stored, which is what an idempotent replay answers (`C-089`).
      const existing = await db
        .select({ storedAt: analyticsEvent.storedAt })
        .from(analyticsEvent)
        .where(eq(analyticsEvent.eventId, accepted.event_id))
        .limit(1);
      const stored = existing[0];
      if (stored === undefined) {
        throw new Error(
          'The analytics store did not confirm the stored instant; the event must be retried.',
        );
      }
      return { storedAt: stored.storedAt };
    },

    async replaceUserToken(userId: string, token: string): Promise<{ readonly replaced: number }> {
      if (!IDENTIFIER_PATTERN.test(userId) || !IDENTIFIER_PATTERN.test(token)) {
        throw new Error('A replacement needs a member identifier and a token in the C-001 form.');
      }

      await db
        .update(analyticsEvent)
        .set({ userId: token })
        .where(eq(analyticsEvent.userId, userId));

      // The count is of events now carrying the token, not of rows this attempt touched, so a retry
      // of an already-completed deletion reports the same replacement (`C-077`).
      const counted = await db
        .select({ replaced: count() })
        .from(analyticsEvent)
        .where(eq(analyticsEvent.userId, token));
      return { replaced: Number(counted[0]?.replaced ?? 0) };
    },
  };
}
