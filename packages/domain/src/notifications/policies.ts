/**
 * The notification boundary's rules (`C-076`, `NFR-004`).
 *
 * Every function here is pure and total: no clock read, no I/O, no argument mutation
 * (`packages/domain/AGENTS.md` Structure). The three rules worth naming:
 *
 * 1. **A payload is a closed key set per template.** The queue is durable, and a durable copy of a
 *    message body — or of the one-time code inside it — is a credential at rest that survives a backup.
 *    So the payload carries only the values a renderer needs to *reconstruct* the message, and a key the
 *    template does not declare is refused rather than stored (`C-076`, `NFR-024`).
 * 2. **Retry is bounded and predictable.** An attempt that is held is retried on a geometric schedule
 *    capped at a ceiling, for a fixed number of attempts; after the budget the message is `failed` and
 *    the row is kept. `C-076`'s own example prints a first retry thirty seconds after the send, which is
 *    where {@link DEFAULT_NOTIFICATION_RETRY_POLICY} takes its first delay from.
 * 3. **A hold is not a loss.** `held` is derived, never stored: a message is held while it is queued with
 *    a held last outcome, which is what `C-076` reports to the caller that produced the notice.
 */
import { addSeconds } from '../identity/policies.ts';
import type {
  NotificationAttempt,
  NotificationAttemptOutcome,
  NotificationChannel,
  NotificationDeliveryState,
  NotificationFieldReason,
  NotificationRecordView,
  NotificationRecipientKind,
  NotificationRecipientReference,
  NotificationState,
  NotificationTemplate,
  OutboundNotification,
} from './entities.ts';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_RECIPIENT_KINDS,
  NOTIFICATION_STATES,
  NOTIFICATION_TEMPLATES,
} from './entities.ts';

/** A `C-001` record or recipient identifier: three lower-case letters, an underscore, a body. */
export const NOTIFICATION_IDENTIFIER_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;

/**
 * A dedupe key: one lower-case namespace, a colon, then opaque tokens.
 *
 * `decision:dec_01J9ZB1C3D5E7F9G1H3J5K7LMP` is the shape `C-076` prints. The namespace says which fact
 * the notice is about, so two different facts about one submission never collide, and the body is
 * identifiers only — never a name, a number or a line of text.
 */
export const NOTIFICATION_DEDUPE_KEY_PATTERN = /^[a-z][a-z0-9_]*:[A-Za-z0-9_.:-]{1,180}$/;

/** The longest payload value; a rendered notice is not assembled from prose held in the queue. */
export const NOTIFICATION_PAYLOAD_VALUE_MAX_LENGTH = 200;

/** `C-001` pagination: default 20, maximum 50. */
export const NOTIFICATION_PAGE_DEFAULT_LIMIT = 20;
export const NOTIFICATION_PAGE_MAX_LIMIT = 50;

/**
 * The payload keys each template may carry.
 *
 * `registration_code` carries the code store's own target and the message lifetime, never the digits:
 * the body is rendered at send time by the component that holds the outstanding code, so a queue row —
 * and every backup of it — cannot be replayed into a working code.
 */
export const PAYLOAD_KEYS_BY_TEMPLATE: Readonly<Record<NotificationTemplate, readonly string[]>> = {
  registration_code: ['targetId', 'expiresInMinutes'],
  decision_published: ['reference', 'decisionType'],
  appeal_decided: ['reference'],
  session_reminder: ['sessionId', 'startsAt'],
  data_request_outcome: [],
};

/** The identifier prefix each recipient kind carries (`C-001` Identifier prefixes). */
export const RECIPIENT_PREFIX_BY_KIND: Readonly<Record<NotificationRecipientKind, string>> = {
  member: 'mbr_',
  pending_registration: 'prg_',
};

/**
 * The retry budget.
 *
 * The numbers are the boundary's, not a vendor's and not a caller's: a deployment may narrow them
 * through the composition root, but a use case cannot widen them at a call site.
 */
export interface NotificationRetryPolicy {
  /** Attempts including the first before the message is recorded `failed`. */
  readonly maxAttempts: number;
  /** The wait after the first attempt; `C-076` prints thirty seconds. */
  readonly firstDelaySeconds: number;
  /** Each further wait multiplies by this, up to the ceiling. */
  readonly multiplier: number;
  /** The longest single wait, so an outage never parks a message for a day. */
  readonly maxDelaySeconds: number;
  /** How long a claimed row stays claimed, so a stalled dispatcher cannot hold it for ever. */
  readonly leaseSeconds: number;
}

/**
 * The default budget: thirty seconds, doubling, capped at five minutes, eight attempts.
 *
 * Eight attempts at that schedule covers roughly twenty-two minutes of a channel outage inside one
 * sweep chain, which matches `operations.md`'s registration-degradation plan: switch provider within two
 * hours, keep the pending registrations. The pending registration is untouched by any of this — it lives
 * for its own twenty-four hours (`C-002`) — so the budget only decides when the *message* stops being
 * retried.
 */
export const DEFAULT_NOTIFICATION_RETRY_POLICY: NotificationRetryPolicy = {
  maxAttempts: 8,
  firstDelaySeconds: 30,
  multiplier: 2,
  maxDelaySeconds: 300,
  leaseSeconds: 60,
};

/** One reading of an input value, in the shape the other domain modules use. */
export type Reading<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly field: string; readonly reason: NotificationFieldReason };

/** Whether a string names a channel. */
export function isNotificationChannel(value: string): value is NotificationChannel {
  return (NOTIFICATION_CHANNELS as readonly string[]).includes(value);
}

/** Whether a string names a template. */
export function isNotificationTemplate(value: string): value is NotificationTemplate {
  return (NOTIFICATION_TEMPLATES as readonly string[]).includes(value);
}

/** Whether a string names a state. */
export function isNotificationState(value: string): value is NotificationState {
  return (NOTIFICATION_STATES as readonly string[]).includes(value);
}

/** Whether a string names a recipient kind. */
export function isNotificationRecipientKind(value: string): value is NotificationRecipientKind {
  return (NOTIFICATION_RECIPIENT_KINDS as readonly string[]).includes(value);
}

/** Whether a message is finished with, either delivered or given up on. */
export function isTerminalState(state: NotificationState): boolean {
  return state !== 'queued';
}

/**
 * The wait before the next attempt.
 *
 * @param attempts - Attempts already recorded, this one included.
 * @param policy - The budget.
 * @returns The delay in whole seconds: `first`, `first × multiplier`, … capped at the ceiling.
 */
export function retryDelaySeconds(attempts: number, policy: NotificationRetryPolicy): number {
  const step = Math.max(0, attempts - 1);
  const raw = policy.firstDelaySeconds * policy.multiplier ** step;
  return Math.min(Math.round(raw), policy.maxDelaySeconds);
}

/**
 * The instant a message becomes due again.
 *
 * @param at - The attempt's instant.
 * @param attempts - Attempts recorded after that attempt.
 * @param policy - The budget.
 */
export function nextAttemptAt(
  at: string,
  attempts: number,
  policy: NotificationRetryPolicy,
): string {
  return addSeconds(at, retryDelaySeconds(attempts, policy));
}

/** The instant an enqueued message first becomes due; `C-076`'s example is the send time plus thirty. */
export function firstAttemptAt(createdAt: string, policy: NotificationRetryPolicy): string {
  return addSeconds(createdAt, policy.firstDelaySeconds);
}

/**
 * Whether a message is currently held.
 *
 * `C-076` sets `held:true` when the channel is unavailable and the message is retained, so the flag is
 * derived from the state plus the last outcome rather than stored beside them, where it could disagree.
 */
export function isHeld(record: Pick<OutboundNotification, 'state' | 'lastOutcome'>): boolean {
  return record.state === 'queued' && record.lastOutcome === 'held';
}

/**
 * Turn one attempt's result into the record the repository writes.
 *
 * A held attempt is retried while the budget lasts and becomes `failed` when it runs out; a gateway
 * refusal is `failed` at once, because sending the same message again unchanged cannot help; an accepted
 * message is `sent` and is never attempted again.
 *
 * @param input - The instant, the count before this attempt, the outcome and its stable cause.
 * @returns The attempt, already carrying the state, the new count and (while queued) the next instant.
 */
export function recordAttempt(input: {
  readonly at: string;
  readonly attemptsBefore: number;
  readonly outcome: NotificationAttemptOutcome;
  readonly messageRef: string | null;
  readonly cause: string | null;
  readonly policy: NotificationRetryPolicy;
}): NotificationAttempt {
  const attempts = input.attemptsBefore + 1;
  const base = {
    at: input.at,
    outcome: input.outcome,
    messageRef: input.messageRef,
    cause: input.cause,
    attempts,
  } as const;

  if (input.outcome === 'delivered') {
    return { ...base, state: 'sent' };
  }
  if (input.outcome === 'failed') {
    return { ...base, state: 'failed' };
  }
  if (attempts >= input.policy.maxAttempts) {
    return { ...base, state: 'failed' };
  }
  return { ...base, state: 'queued', nextAttemptAt: nextAttemptAt(input.at, attempts, input.policy) };
}

/** The `C-076` `enqueue` result for one record. */
export function deliveryStateOf(record: OutboundNotification): NotificationDeliveryState {
  return {
    notificationId: record.id,
    channel: record.channel,
    state: record.state,
    attempts: record.attempts,
    nextAttemptAt: record.nextAttemptAt,
    held: isHeld(record),
  };
}

/** The read shape `getDeliveryState` and `listHeld` answer with. */
export function recordViewOf(record: OutboundNotification): NotificationRecordView {
  const view: NotificationRecordView = {
    ...deliveryStateOf(record),
    template: record.template,
    createdAt: record.createdAt,
    ...(record.lastAttemptAt === undefined ? {} : { lastAttemptAt: record.lastAttemptAt }),
    ...(record.lastOutcome === undefined ? {} : { lastOutcome: record.lastOutcome }),
    ...(record.lastCause === undefined ? {} : { lastCause: record.lastCause }),
    ...(record.sentAt === undefined ? {} : { sentAt: record.sentAt }),
    ...(record.failedAt === undefined ? {} : { failedAt: record.failedAt }),
  };
  return view;
}

/** Read a channel from an untrusted value. */
export function readChannel(value: unknown): Reading<NotificationChannel> {
  if (value === undefined || value === null || value === '') {
    return { ok: false, field: 'channel', reason: 'REQUIRED' };
  }
  if (typeof value !== 'string' || !isNotificationChannel(value)) {
    return { ok: false, field: 'channel', reason: 'ENUM_MISMATCH' };
  }
  return { ok: true, value };
}

/** Read a template from an untrusted value. */
export function readTemplate(value: unknown): Reading<NotificationTemplate> {
  if (value === undefined || value === null || value === '') {
    return { ok: false, field: 'template', reason: 'REQUIRED' };
  }
  if (typeof value !== 'string' || !isNotificationTemplate(value)) {
    return { ok: false, field: 'template', reason: 'ENUM_MISMATCH' };
  }
  return { ok: true, value };
}

/**
 * Read a recipient reference and check that its prefix agrees with its kind.
 *
 * @param value - The untrusted recipient, as `{ kind, id }`.
 */
export function readRecipient(value: unknown): Reading<NotificationRecipientReference> {
  if (value === null || typeof value !== 'object') {
    return { ok: false, field: 'recipient', reason: 'REQUIRED' };
  }
  const candidate = value as { readonly kind?: unknown; readonly id?: unknown };
  if (typeof candidate.kind !== 'string' || candidate.kind === '') {
    return { ok: false, field: 'recipient.kind', reason: 'REQUIRED' };
  }
  if (!isNotificationRecipientKind(candidate.kind)) {
    return { ok: false, field: 'recipient.kind', reason: 'ENUM_MISMATCH' };
  }
  if (typeof candidate.id !== 'string' || candidate.id === '') {
    return { ok: false, field: 'recipient.id', reason: 'REQUIRED' };
  }
  if (!NOTIFICATION_IDENTIFIER_PATTERN.test(candidate.id)) {
    return { ok: false, field: 'recipient.id', reason: 'PATTERN_MISMATCH' };
  }
  if (!candidate.id.startsWith(RECIPIENT_PREFIX_BY_KIND[candidate.kind])) {
    // A member reference that names a pending registration would resolve to the wrong record.
    return { ok: false, field: 'recipient.id', reason: 'PATTERN_MISMATCH' };
  }
  return { ok: true, value: { kind: candidate.kind, id: candidate.id } };
}

/**
 * Read the payload for one template.
 *
 * Only the keys that template declares are accepted, each a short non-empty string. The body of the
 * message is not here: it is rendered at send time, so a stored row cannot carry a rendered code.
 */
export function readPayload(
  template: NotificationTemplate,
  value: unknown,
): Reading<Readonly<Record<string, string>>> {
  if (value === undefined) return { ok: true, value: {} };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, field: 'payload', reason: 'PATTERN_MISMATCH' };
  }
  const allowed = PAYLOAD_KEYS_BY_TEMPLATE[template];
  const entries = Object.entries(value as Readonly<Record<string, unknown>>);
  const payload: Record<string, string> = {};
  for (const [key, raw] of entries) {
    if (!allowed.includes(key)) {
      return { ok: false, field: `payload.${key}`, reason: 'UNKNOWN_FIELD' };
    }
    if (typeof raw !== 'string') {
      return { ok: false, field: `payload.${key}`, reason: 'PATTERN_MISMATCH' };
    }
    if (raw.length > NOTIFICATION_PAYLOAD_VALUE_MAX_LENGTH) {
      return { ok: false, field: `payload.${key}`, reason: 'TOO_LONG' };
    }
    payload[key] = raw;
  }
  return { ok: true, value: payload };
}

/** Read the caller's deduplication key. */
export function readDedupeKey(value: unknown): Reading<string> {
  if (value === undefined || value === null || value === '') {
    return { ok: false, field: 'dedupeKey', reason: 'REQUIRED' };
  }
  if (typeof value !== 'string' || !NOTIFICATION_DEDUPE_KEY_PATTERN.test(value)) {
    return { ok: false, field: 'dedupeKey', reason: 'PATTERN_MISMATCH' };
  }
  return { ok: true, value };
}

/**
 * Read a page or sweep limit under the `C-001` convention: default 20, refused outside 1–50.
 *
 * @param value - The untrusted limit.
 * @param field - The field name a refusal names.
 */
export function readLimit(value: unknown, field = 'limit'): Reading<number> {
  if (value === undefined || value === null) return { ok: true, value: NOTIFICATION_PAGE_DEFAULT_LIMIT };
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > NOTIFICATION_PAGE_MAX_LIMIT) {
    return { ok: false, field, reason: 'OUT_OF_BAND' };
  }
  return { ok: true, value: parsed };
}
