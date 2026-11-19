/**
 * The notification boundary's types (`C-076`).
 *
 * A notification is a message the campaign owes someone: a one-time code, a decision notice, an
 * appeal outcome, a session reminder or the answer to a data request. The boundary owns its *delivery*,
 * not the fact it reports, so this module holds no member record, no decision and no content. What it
 * holds is one row's worth of delivery state: which template, to which opaque recipient reference, due
 * when, tried how many times, and where it stands.
 *
 * Three properties are deliberate and are asserted by tests:
 *
 * - The queue holds **no destination number, no message body and no code** (`C-076`, `NFR-024`). The
 *   body is rendered at send time from the template and its payload, and the payload is restricted to
 *   the closed key set `policies.ts` allows per template. A credential in the queue would be a
 *   credential in a backup.
 * - A recipient is named by an identifier, never by a person: `mbr_` for an account and `prg_` for a
 *   pending registration, because a one-time code is owed to a form that has no account yet
 *   (`FEAT-001`, `C-002`).
 * - `held` is not a state. A message whose channel is unavailable stays `queued` with its next attempt
 *   scheduled, which is what `C-076` means by "held, not lost"; a message that will never be retried is
 *   `failed` and the row is kept rather than discarded.
 */

/** `channel` in the `C-076` request. */
export const NOTIFICATION_CHANNELS = ['sms', 'in_product'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** `template` in the `C-076` request: the closed set of messages the boundary can send. */
export const NOTIFICATION_TEMPLATES = [
  'registration_code',
  'decision_published',
  'appeal_decided',
  'session_reminder',
  'data_request_outcome',
] as const;
export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/**
 * `state` in the `C-076` answer.
 *
 * `queued` covers both "waiting for its first attempt" and "held for a later attempt"; `sent` means the
 * gateway accepted it or, for `in_product`, that the notice is now readable; `failed` means it will not
 * be retried, either because the gateway refused this message or because the attempt budget ran out.
 */
export const NOTIFICATION_STATES = ['queued', 'sent', 'failed'] as const;
export type NotificationState = (typeof NOTIFICATION_STATES)[number];

/** What one delivery attempt did, in the delivery port's vocabulary (`C-076`). */
export const NOTIFICATION_ATTEMPT_OUTCOMES = ['delivered', 'held', 'failed'] as const;
export type NotificationAttemptOutcome = (typeof NOTIFICATION_ATTEMPT_OUTCOMES)[number];

/**
 * Who the message is for, as an opaque reference.
 *
 * `kind` and the identifier prefix agree: a `member` carries `mbr_`, a `pending_registration` carries
 * `prg_`. The queue stores this and nothing else about the recipient; the destination and the locale are
 * resolved through the recipient port at the moment of the send.
 */
export const NOTIFICATION_RECIPIENT_KINDS = ['member', 'pending_registration'] as const;
export type NotificationRecipientKind = (typeof NOTIFICATION_RECIPIENT_KINDS)[number];

/** One recipient reference. Never a name, a number or an address. */
export interface NotificationRecipientReference {
  readonly kind: NotificationRecipientKind;
  readonly id: string;
}

/** One recorded delivery attempt. The repository writes it verbatim; the rules live in `policies.ts`. */
export interface NotificationAttempt {
  /** When the attempt ran. */
  readonly at: string;
  /** What it produced. */
  readonly outcome: NotificationAttemptOutcome;
  /** The gateway's reference when it accepted the message; never a destination. */
  readonly messageRef: string | null;
  /** A stable cause token when the attempt was held or failed; never a provider payload. */
  readonly cause: string | null;
  /** The state the row moves to as a result of this attempt. */
  readonly state: NotificationState;
  /** The total attempts recorded against the row, this one included. */
  readonly attempts: number;
  /** The instant the next attempt is due; absent once the row is terminal. */
  readonly nextAttemptAt?: string;
}

/**
 * One queued message (`C-076`).
 *
 * Field names follow the contract's own spelling (`notificationId` is the wire name for `id`) so a
 * projection to the answer needs no vocabulary of its own.
 */
export interface OutboundNotification {
  readonly id: string;
  readonly channel: NotificationChannel;
  readonly template: NotificationTemplate;
  readonly recipient: NotificationRecipientReference;
  /** Non-personal values the template needs at render time, restricted per template. */
  readonly payload: Readonly<Record<string, string>>;
  /** The caller's stable identity for this message: a replay with the same key sends nothing twice. */
  readonly dedupeKey: string;
  readonly state: NotificationState;
  /** Total attempts recorded, `0` until the first one runs. */
  readonly attempts: number;
  /** When the next attempt is due. Set at enqueue so a queued message always has a time. */
  readonly nextAttemptAt: string;
  readonly createdAt: string;
  readonly lastAttemptAt?: string;
  readonly lastOutcome?: NotificationAttemptOutcome;
  readonly lastCause?: string;
  /** The gateway's reference for the accepted message. */
  readonly messageRef?: string | null;
  readonly sentAt?: string;
  readonly failedAt?: string;
}

/**
 * A message one dispatcher has taken responsibility for.
 *
 * The lease token is the repository's own guard: only the holder may record the attempt, so a
 * dispatcher that stalled past its lease cannot overwrite the outcome of the attempt that replaced it,
 * and two dispatchers cannot both send the same message (`C-076` "a replay does not send twice").
 */
export interface ClaimedNotification {
  readonly record: OutboundNotification;
  readonly leaseToken: string;
}

/** The `C-076` `enqueue` result: exactly the six fields that entry prints. */
export interface NotificationDeliveryState {
  readonly notificationId: string;
  readonly channel: NotificationChannel;
  readonly state: NotificationState;
  readonly attempts: number;
  readonly nextAttemptAt: string;
  /** True when the channel is unavailable and the message is retained rather than lost. */
  readonly held: boolean;
}

/**
 * One message as `getDeliveryState` and `listHeld` report it.
 *
 * `C-076` prints the shape only for `enqueue`, so this module defines the read shape once: the delivery
 * state plus what an operator needs to judge whether a channel is draining. It still carries no
 * destination, no body and no code.
 */
export interface NotificationRecordView extends NotificationDeliveryState {
  readonly template: NotificationTemplate;
  readonly createdAt: string;
  readonly lastAttemptAt?: string;
  readonly lastOutcome?: NotificationAttemptOutcome;
  readonly lastCause?: string;
  readonly sentAt?: string;
  readonly failedAt?: string;
}

/**
 * The caller: an authenticated service component on an internal-only surface.
 *
 * `C-076` names no caller-side role, and the boundary is never reachable from a page, so the component
 * is carried for the log's correlation rather than for a permission check.
 */
export interface NotificationCaller {
  /** The component that asked, for example `identity`, `decision_service` or `worker`. */
  readonly component: string;
  readonly correlationId?: string;
}

/** The `C-001` failure codes this boundary can answer. */
export type NotificationFailureCode = 'VALIDATION_FAILED' | 'NOT_FOUND' | 'SERVICE_DEGRADED';

/** A field-level reason token from the frozen `C-001` set. */
export type NotificationFieldReason =
  'REQUIRED' | 'PATTERN_MISMATCH' | 'OUT_OF_BAND' | 'ENUM_MISMATCH' | 'TOO_LONG' | 'UNKNOWN_FIELD';

/** A refusal in the `C-001` error shape. */
export interface NotificationFailure {
  readonly ok: false;
  readonly code: NotificationFailureCode;
  /** A stable upper-snake token naming the specific reason. */
  readonly cause: string;
  readonly message: string;
  readonly fields: Readonly<Record<string, NotificationFieldReason>>;
}

/**
 * Build one refusal.
 *
 * @param code - A `C-001` code this boundary is allowed to answer.
 * @param cause - The stable upper-snake reason.
 * @param message - The line a log or an operator console shows. It never quotes a message body.
 * @param fields - Field paths mapped to frozen reason tokens, for `VALIDATION_FAILED`.
 */
export function notificationFailure(
  code: NotificationFailureCode,
  cause: string,
  message: string,
  fields: Readonly<Record<string, NotificationFieldReason>> = {},
): NotificationFailure {
  return { ok: false, code, cause, message, fields };
}
