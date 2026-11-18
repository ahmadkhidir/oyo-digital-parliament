/**
 * The effects the notification boundary cannot perform itself (`C-076`).
 *
 * Four seams, each narrow enough that an adapter can satisfy it without leaking a vendor's shape into a
 * rule (`packages/domain/AGENTS.md` Structure):
 *
 * - the **queue**, which is durable and idempotent and lives in `packages/db`;
 * - the **recipient**, which turns an opaque reference into a destination and a locale at send time —
 *   the only moment a destination exists, and the reason no number is ever stored;
 * - the **body**, which renders the message from its template and payload at send time, so the queue
 *   never holds a rendered code;
 * - the **SMS transport**, which reports one attempt and never decides whether to retry it.
 *
 * The clock and the identifier generator arrive in the same bundle as everywhere else, so no use case
 * reaches for an ambient instant.
 */
import type { Locale } from '../identity/entities.ts';
import type { ClockPort } from '../ports/clock.ts';
import type { IdentifierPort } from '../ports/identifiers.ts';
import type { SmsDeliveryPort } from '../ports/notifications.ts';
import type {
  ClaimedNotification,
  NotificationAttempt,
  NotificationRecipientReference,
  OutboundNotification,
} from './entities.ts';
import type { NotificationRetryPolicy } from './policies.ts';

/**
 * The durable outbound queue (`C-076` `enqueue`, `getDeliveryState`, `listHeld`).
 *
 * Two properties are the adapter's to keep, because only it can keep them:
 *
 * - **Idempotent enqueue.** A `dedupeKey` that is already stored returns the stored row with
 *   `created:false` and no second record. The uniqueness is the database's, not a prior read's.
 * - **One claim per message.** {@link claimById} and {@link claimDue} hand out a lease token and only
 *   that token may record the attempt, so a replay, a retry after a stall or a second worker cannot send
 *   the same message twice.
 */
export interface OutboundQueuePort {
  /**
   * Store one message, or return the one already stored under its dedupe key.
   *
   * @throws when the store is unreachable; the caller answers `SERVICE_DEGRADED` and nothing is queued.
   */
  enqueue(record: OutboundNotification): Promise<{
    readonly record: OutboundNotification;
    readonly created: boolean;
  }>;

  findById(notificationId: string): Promise<OutboundNotification | null>;

  findByDedupeKey(dedupeKey: string): Promise<OutboundNotification | null>;

  /**
   * Claim one queued message for dispatch.
   *
   * The schedule is deliberately not consulted: a caller naming one message is asking for it now, which
   * is how the one-time code behind `C-002` leaves during the request that issued it. The backoff
   * schedule belongs to {@link claimDue}.
   *
   * @returns The claim, or `null` when the row is absent, already terminal, or held by another
   *   dispatcher's live lease. A `null` is never an error: the caller reads the row and reports its
   *   state instead of sending again.
   */
  claimById(input: {
    readonly notificationId: string;
    readonly at: string;
    readonly leaseUntil: string;
  }): Promise<ClaimedNotification | null>;

  /**
   * Claim up to `limit` messages whose next attempt is due.
   *
   * The claim is a conditional write, so two sweeps starting at the same instant claim disjoint rows.
   */
  claimDue(input: {
    readonly at: string;
    readonly leaseUntil: string;
    readonly limit: number;
  }): Promise<readonly ClaimedNotification[]>;

  /**
   * Record one attempt against a claimed message.
   *
   * @returns The updated row, or `null` when the lease had lapsed and another dispatcher owns it; a
   *   `null` is not a reason to send again, only to stop.
   */
  recordAttempt(input: {
    readonly notificationId: string;
    readonly leaseToken: string;
    readonly attempt: NotificationAttempt;
  }): Promise<OutboundNotification | null>;

  /** The queue's held view: queued messages whose channel did not answer, oldest attempt first. */
  listHeld(input: {
    readonly cursor?: string;
    readonly limit: number;
  }): Promise<{
    readonly rows: readonly OutboundNotification[];
    readonly nextCursor: string | null;
  }>;
}

/**
 * What the boundary needs to know about a recipient at the moment of the send.
 *
 * The destination exists only for the length of the call that carries it: it is passed to the SMS
 * adapter and dropped. Neither field is stored, logged or put in a metric label (`NFR-024`).
 */
export interface NotificationRecipient {
  readonly locale: Locale;
  /** The E.164 destination for an `sms` message; absent for `in_product`. */
  readonly smsDestination?: string;
}

/** Resolves an opaque recipient reference into the facts one send needs. */
export interface NotificationRecipientPort {
  /**
   * @returns The recipient's locale and destination, or `null` when the reference names no live record
   *   — an anonymised account (`FEAT-012`) or a pending registration that has been discarded.
   */
  resolve(recipient: NotificationRecipientReference): Promise<NotificationRecipient | null>;
}

/** Renders the message body at send time from the template and the store's own state. */
export interface NotificationBodyPort {
  /**
   * @param input - The queued record and the resolved recipient.
   * @returns The body to hand the gateway, or `null` when this template cannot be rendered (for
   *   example an expired one-time code that is no longer outstanding). A `null` fails the message; it
   *   never sends an empty body.
   */
  render(input: {
    readonly record: OutboundNotification;
    readonly recipient: NotificationRecipient;
  }): Promise<string | null>;
}

/** The port bundle every notification use case receives. */
export interface NotificationPorts {
  readonly queue: OutboundQueuePort;
  readonly recipients: NotificationRecipientPort;
  readonly bodies: NotificationBodyPort;
  readonly sms: SmsDeliveryPort;
  readonly clock: ClockPort;
  readonly identifiers: IdentifierPort;
  /** Operator configuration may narrow the budget; absent means the boundary's default. */
  readonly retry?: NotificationRetryPolicy;
}
