/**
 * Internal idempotency record — **infrastructure, not a product entity**.
 *
 * ADR-002 puts every idempotent write path and every worker run key on the same durable store:
 * `(scope, key)` identifies the operation, `fingerprint` identifies the request payload, and
 * `response` holds the original result so a replay returns it without a second effect. The table is
 * deliberately outside `schema.md`: it is not part of the public record, it never appears in a public
 * projection, an export, the handover archive or analytics, and it is never used to reconstruct
 * history. Its retention follows the operational window of the job or write it serves, which is why
 * `expires_at` carries an index for the purge.
 *
 * The state machine is two values: `in_progress` while the business transaction is open, `completed`
 * once the response is stored in the same transaction as the business change. A key reused with a
 * different fingerprint is a conflict and is refused by the store, not by a caller's comparison.
 */
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { utcTimestamp } from './columns.ts';

export const idempotencyRecord = pgTable(
  'idempotency_record',
  {
    /** The surface or job the key belongs to, for example `submission.publish` or `job.overdue`. */
    scope: text('scope').notNull(),
    /** The `Idempotency-Key`, or a worker job's stable run key. */
    key: text('key').notNull(),
    /** A digest of the request payload; a reused key with a different digest is a conflict. */
    fingerprint: text('fingerprint').notNull(),
    state: text('state').notNull(),
    /** The stored result, present once the operation completed. */
    response: jsonb('response'),
    createdAt: utcTimestamp('created_at').notNull(),
    expiresAt: utcTimestamp('expires_at').notNull(),
  },
  (t) => [
    check('idempotency_state_domain', sql`${t.state} in ('in_progress', 'completed')`),
    // The claim: one record per scope and key. `ON CONFLICT` on this index is the claim itself.
    uniqueIndex('idempotency_scope_key_key').on(t.scope, t.key),
    // Read path: the retention purge, which removes records past their operational window.
    index('idempotency_expires_idx').on(t.expiresAt),
  ],
);
