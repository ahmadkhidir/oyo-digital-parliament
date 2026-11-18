/**
 * Outbound notification — **internal delivery infrastructure, not a product entity**.
 *
 * `C-076` is the boundary: it queues one-time codes, decision notices, appeal outcomes, session reminders
 * and data-request outcomes, holds a message when its channel is unavailable and retries it with
 * backoff. This table is the durable half of that promise (`architecture.md` Notification Service:
 * "Consumes: SMS gateway, Primary Database for the outbound queue").
 *
 * Three decisions are worth stating, because each one is a rule rather than a preference:
 *
 * - **No personal data and no credential.** The row holds a recipient *identifier* (`mbr_` or `prg_`),
 *   a template name and a closed set of non-personal payload values. The destination number, the
 *   rendered body and the one-time code are absent by design: the number is resolved at send time, and
 *   the body is rendered at send time. A queue that copied them would put a working code and a telephone
 *   number into every backup (`NFR-024`, `NFR-040`).
 * - **The dedupe key is unique.** That single index is what makes enqueue idempotent: a replayed publish
 *   or a retried request finds the row already there and queues nothing new.
 * - **A claim is a lease.** `lease_token` and `lease_until` let exactly one dispatcher own a row, so a
 *   replay, a stalled run or a second worker sweeping at the same instant cannot send the same message
 *   twice. `recordAttempt` is a conditional write on the token, not on the row's current mood.
 *
 * The vocabulary lives in check constraints rather than in `src/schema/enums.ts`: that file mirrors
 * `schema.md` one enum per specification enum, and none of these values appears in `schema.md` because
 * this record is internal. A new template is a migration on this table and nowhere else.
 *
 * No foreign key is declared for the recipient. A `registration_code` is owed to a PendingRegistration,
 * which `nfr.md`'s data lifecycle discards after twenty-four hours; a foreign key would either block that
 * sweep or delete a delivery record the operator still needs to read.
 */
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { check, index, jsonb, pgTable, smallint, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';

/** The five templates `C-076` prints. */
export const OUTBOUND_TEMPLATES = [
  'registration_code',
  'decision_published',
  'appeal_decided',
  'session_reminder',
  'data_request_outcome',
] as const;

/** The two channels `C-076` prints. */
export const OUTBOUND_CHANNELS = ['sms', 'in_product'] as const;

/** The three states `C-076` reports; `held` is derived from the last outcome, never stored. */
export const OUTBOUND_STATES = ['queued', 'sent', 'failed'] as const;

/** What one attempt produced, as the SMS delivery port reports it. */
export const OUTBOUND_ATTEMPT_OUTCOMES = ['delivered', 'held', 'failed'] as const;

/**
 * A `check` expression over a fixed vocabulary.
 *
 * The members are inlined as SQL literals rather than bound as parameters: a generated migration is a
 * file with no bind site, so a `$1` placeholder would make it unrunnable. Every value here is a
 * compile-time constant from this module, never a caller's input.
 */
function inList(column: AnyPgColumn, values: readonly string[]) {
  return sql`${column} in (${sql.raw(values.map((value) => `'${value}'`).join(', '))})`;
}

export const outboundNotification = pgTable(
  'outbound_notification',
  {
    /** `C-001` `ntf_` identifier (`CONTRACTS.md` Identifier prefixes). */
    id: text('id').primaryKey(),
    /** `C-076` `channel`. */
    channel: text('channel').notNull(),
    /** `C-076` `template`. */
    template: text('template').notNull(),
    /** `member` for an account, `pending_registration` for a form with no account yet. */
    recipientKind: text('recipient_kind').notNull(),
    /** The opaque recipient identifier. Never a name, a number or an address. */
    recipientId: text('recipient_id').notNull(),
    /** Closed per-template values the renderer needs; never a body and never a code. */
    payload: jsonb('payload').$type<Record<string, string>>().notNull(),
    /** The caller's stable identity for this message; unique, so a replay queues nothing. */
    dedupeKey: text('dedupe_key').notNull(),
    state: text('state').notNull(),
    /** Total attempts recorded, `0` until the first one runs. */
    attempts: smallint('attempts').notNull().default(0),
    /** When the next attempt is due; a queued row always carries one. */
    nextAttemptAt: utcTimestamp('next_attempt_at').notNull(),
    createdAt: utcTimestamp('created_at').notNull(),
    lastAttemptAt: utcTimestamp('last_attempt_at'),
    /** The last attempt's outcome, which is what makes `held` derivable. */
    lastOutcome: text('last_outcome'),
    /** A stable cause token from the delivery adapter; never a provider payload. */
    lastCause: text('last_cause'),
    /** The gateway's reference for an accepted message. Never a destination. */
    messageRef: text('message_ref'),
    /** The dispatcher that currently owns the row, and until when. */
    leaseToken: text('lease_token'),
    leaseUntil: utcTimestamp('lease_until'),
    sentAt: utcTimestamp('sent_at'),
    failedAt: utcTimestamp('failed_at'),
  },
  (t) => [
    check('outbound_notification_id_format', isIdentifier(t.id)),
    check('outbound_notification_channel_domain', inList(t.channel, OUTBOUND_CHANNELS)),
    check('outbound_notification_template_domain', inList(t.template, OUTBOUND_TEMPLATES)),
    check(
      'outbound_notification_recipient_kind_domain',
      inList(t.recipientKind, ['member', 'pending_registration']),
    ),
    // The kind and the prefix must agree, or the row names the wrong record at send time.
    check(
      'outbound_notification_recipient_prefix',
      sql`(${t.recipientKind} = 'member' and ${t.recipientId} ~ '^mbr_[0-9A-Z]{4,26}$')
        or (${t.recipientKind} = 'pending_registration' and ${t.recipientId} ~ '^prg_[0-9A-Z]{4,26}$')`,
    ),
    check('outbound_notification_state_domain', inList(t.state, OUTBOUND_STATES)),
    check(
      'outbound_notification_attempt_outcome_domain',
      sql`${t.lastOutcome} is null or ${t.lastOutcome} in ('delivered', 'held', 'failed')`,
    ),
    check('outbound_notification_attempts_non_negative', sql`${t.attempts} >= 0`),
    // A terminal row records when it became terminal; a queued row records neither instant. Without
    // this, a stale `sent_at` could make an operator read a failed message as a delivered one.
    check(
      'outbound_notification_terminal_instants',
      sql`(${t.state} = 'queued' and ${t.sentAt} is null and ${t.failedAt} is null)
        or (${t.state} = 'sent' and ${t.sentAt} is not null and ${t.failedAt} is null)
        or (${t.state} = 'failed' and ${t.failedAt} is not null and ${t.sentAt} is null)`,
    ),
    // The idempotency of enqueue: one row per dedupe key, enforced by the database rather than by a
    // prior read that a concurrent request could race.
    uniqueIndex('outbound_notification_dedupe_key_key').on(t.dedupeKey),
    // Read path: the sweep claims what is due, ordered by `next_attempt_at`, filtered by state.
    index('outbound_notification_due_idx').on(t.state, t.nextAttemptAt),
    // Read path: the held queue during an outage (`C-076` `listHeld`), oldest attempt first.
    index('outbound_notification_held_idx')
      .on(t.nextAttemptAt)
      .where(sql`${t.state} = 'queued' and ${t.lastOutcome} = 'held'`),
  ],
);
