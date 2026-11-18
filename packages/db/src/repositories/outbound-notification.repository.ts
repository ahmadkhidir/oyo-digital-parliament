/**
 * The durable outbound queue (`C-076`, `architecture.md` Notification Service).
 *
 * The adapter keeps the two properties only a store can keep:
 *
 * - **Idempotent enqueue.** `INSERT … ON CONFLICT (dedupe_key) DO NOTHING` followed by a read of the
 *   winning row. Two requests racing on one dedupe key produce one message and both callers are told
 *   which; no caller has to read first and hope.
 * - **One claim per message.** A claim is a conditional update — state `queued`, due, and no live lease —
 *   that returns the rows it won. A second dispatcher's statement re-evaluates the condition against the
 *   committed row and skips it, which is why a replay, a stalled run and a concurrent sweep cannot send
 *   the same message twice. The lease token is what `recordAttempt` checks, so a dispatcher that overran
 *   its lease cannot overwrite the attempt that replaced it.
 *
 * Nothing here decides *whether* to retry; that is `@odp/domain`'s policy, passed in as the attempt to
 * record. The adapter writes what it is given and returns domain types, never Drizzle rows.
 */
import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import type {
  NotificationAttempt,
  OutboundNotification,
  OutboundQueuePort,
} from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { outboundNotification } from '../schema/outbound-notification.ts';

/** One repository implements the queue port; nothing else writes this table. */
export type OutboundNotificationRepository = OutboundQueuePort;

/** `C-001` pagination cursor, as the ward reference uses it. */
const CURSOR_PREFIX = 'cur_';
const CURSOR_PATTERN = /^cur_[0-9]{4,26}$/;

function encodeCursor(offset: number): string {
  return `${CURSOR_PREFIX}${String(offset).padStart(6, '0')}`;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || !CURSOR_PATTERN.test(cursor)) return 0;
  const offset = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

/** A new lease token. Opaque, unguessable, and never derived from a recipient or a message. */
function newLeaseToken(): string {
  return randomUUID();
}

/** Maps a stored row to the domain type, dropping the nulls the domain models as absent. */
function toNotification(
  row: typeof outboundNotification.$inferSelect,
): OutboundNotification {
  return {
    id: row.id,
    channel: row.channel as OutboundNotification['channel'],
    template: row.template as OutboundNotification['template'],
    recipient: {
      kind: row.recipientKind as OutboundNotification['recipient']['kind'],
      id: row.recipientId,
    },
    payload: row.payload,
    dedupeKey: row.dedupeKey,
    state: row.state as OutboundNotification['state'],
    attempts: row.attempts,
    nextAttemptAt: row.nextAttemptAt,
    createdAt: row.createdAt,
    ...(row.lastAttemptAt === null ? {} : { lastAttemptAt: row.lastAttemptAt }),
    ...(row.lastOutcome === null
      ? {}
      : { lastOutcome: row.lastOutcome as NonNullable<OutboundNotification['lastOutcome']> }),
    ...(row.lastCause === null ? {} : { lastCause: row.lastCause }),
    ...(row.messageRef === null ? {} : { messageRef: row.messageRef }),
    ...(row.sentAt === null ? {} : { sentAt: row.sentAt }),
    ...(row.failedAt === null ? {} : { failedAt: row.failedAt }),
  };
}

/**
 * Builds the outbound-notification repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the calling write already holds. Enqueueing a
 *   notice beside the write that produced it commits both or neither.
 */
export function createOutboundNotificationRepository(
  executor: Executor,
): OutboundNotificationRepository {
  const db = executorOf(executor);

  /** Not held by another dispatcher's live lease. */
  const leasable = (at: string): SQL =>
    or(
      isNull(outboundNotification.leaseUntil),
      lte(outboundNotification.leaseUntil, at),
    ) as SQL;

  /**
   * The condition a *sweep* claim must satisfy: queued, due, and leasable.
   *
   * A named dispatch (`dispatchNotification`) claims only on `leasable`, because a producing feature is
   * asking for this message now — the code behind `C-002` must leave during the request that issued it,
   * not thirty seconds later.
   */
  const claimable = (at: string): SQL =>
    and(
      eq(outboundNotification.state, 'queued'),
      lte(outboundNotification.nextAttemptAt, at),
      leasable(at),
    ) as SQL;

  return {
    async enqueue(record) {
      const inserted = await db
        .insert(outboundNotification)
        .values({
          id: record.id,
          channel: record.channel,
          template: record.template,
          recipientKind: record.recipient.kind,
          recipientId: record.recipient.id,
          payload: { ...record.payload },
          dedupeKey: record.dedupeKey,
          state: record.state,
          attempts: record.attempts,
          nextAttemptAt: record.nextAttemptAt,
          createdAt: record.createdAt,
        })
        .onConflictDoNothing({ target: outboundNotification.dedupeKey })
        .returning();

      const row = inserted[0];
      if (row !== undefined) return { record: toNotification(row), created: true };

      // The dedupe key is already stored: the message exists, and this call queues nothing new.
      const existing = await db
        .select()
        .from(outboundNotification)
        .where(eq(outboundNotification.dedupeKey, record.dedupeKey))
        .limit(1);
      const stored = existing[0];
      if (stored === undefined) {
        throw new Error('the outbound queue lost a row between insert and read');
      }
      return { record: toNotification(stored), created: false };
    },

    async findById(notificationId) {
      const rows = await db
        .select()
        .from(outboundNotification)
        .where(eq(outboundNotification.id, notificationId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toNotification(row);
    },

    async findByDedupeKey(dedupeKey) {
      const rows = await db
        .select()
        .from(outboundNotification)
        .where(eq(outboundNotification.dedupeKey, dedupeKey))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toNotification(row);
    },

    async claimById({ notificationId, at, leaseUntil }) {
      const leaseToken = newLeaseToken();
      const rows = await db
        .update(outboundNotification)
        .set({ leaseToken, leaseUntil })
        .where(
          and(
            eq(outboundNotification.id, notificationId),
            eq(outboundNotification.state, 'queued'),
            leasable(at),
          ),
        )
        .returning();
      const row = rows[0];
      return row === undefined ? null : { record: toNotification(row), leaseToken };
    },

    async claimDue({ at, leaseUntil, limit }) {
      const leaseToken = newLeaseToken();
      // The candidate list is a subquery so the update claims a bounded, ordered batch; the same
      // condition is repeated in the update itself, so a row another dispatcher won in between is
      // skipped rather than claimed twice.
      const dueIds = db
        .select({ id: outboundNotification.id })
        .from(outboundNotification)
        .where(claimable(at))
        .orderBy(asc(outboundNotification.nextAttemptAt), asc(outboundNotification.id))
        .limit(limit);

      const rows = await db
        .update(outboundNotification)
        .set({ leaseToken, leaseUntil })
        .where(and(claimable(at), inArray(outboundNotification.id, dueIds)))
        .returning();

      return rows
        .map((row) => ({ record: toNotification(row), leaseToken }))
        .sort(
          (left, right) =>
            Date.parse(left.record.nextAttemptAt) - Date.parse(right.record.nextAttemptAt) ||
            left.record.id.localeCompare(right.record.id),
        );
    },

    async recordAttempt({ notificationId, leaseToken, attempt }) {
      const rows = await db
        .update(outboundNotification)
        .set(attemptColumns(attempt))
        .where(
          and(
            eq(outboundNotification.id, notificationId),
            // The token, not the row's state, decides who may finish this attempt.
            eq(outboundNotification.leaseToken, leaseToken),
          ),
        )
        .returning();
      const row = rows[0];
      return row === undefined ? null : toNotification(row);
    },

    async listHeld({ cursor, limit }) {
      const offset = decodeCursor(cursor);
      const rows = await db
        .select()
        .from(outboundNotification)
        .where(
          and(
            eq(outboundNotification.state, 'queued'),
            eq(outboundNotification.lastOutcome, 'held'),
          ),
        )
        .orderBy(asc(outboundNotification.nextAttemptAt), asc(outboundNotification.id))
        .limit(limit + 1)
        .offset(offset);

      const page = rows.slice(0, limit);
      return {
        rows: page.map(toNotification),
        nextCursor: rows.length > limit ? encodeCursor(offset + page.length) : null,
      };
    },
  };
}

/**
 * The columns one recorded attempt moves.
 *
 * `next_attempt_at` is never cleared — it is `NOT NULL` and a queued row always needs a due instant — so a
 * terminal row keeps the instant it finished as its last scheduled time. `sent_at` and `failed_at` are
 * written together with the state, because the table's own check refuses a row that is terminal without
 * its instant or carries both.
 */
function attemptColumns(attempt: NotificationAttempt) {
  return {
    state: attempt.state,
    attempts: attempt.attempts,
    nextAttemptAt: attempt.nextAttemptAt ?? attempt.at,
    lastAttemptAt: attempt.at,
    lastOutcome: attempt.outcome,
    lastCause: attempt.cause,
    messageRef: attempt.messageRef,
    sentAt: attempt.state === 'sent' ? attempt.at : null,
    failedAt: attempt.state === 'failed' ? attempt.at : null,
    // The attempt is finished with, so the lease is released in the same write.
    leaseToken: null,
    leaseUntil: null,
  };
}
