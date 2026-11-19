/**
 * Delivering queued notices (`C-076`, `FEAT-001`, `NFR-004`).
 *
 * Three entry points, one rule each:
 *
 * - {@link dispatchNotification} delivers one named message now. This is the call a producing feature
 *   makes when the resident is waiting on it — the one-time code behind `C-002` — so it answers with the
 *   message's state rather than an exception: `sent` means the gateway took it, and a hold means the
 *   notice is queued for its next attempt and the pending registration is untouched.
 * - {@link flushDueNotifications} is the sweep. It claims what is due and delivers it, which is how a
 *   message survives the request that produced it and an outage that outlasts it.
 * - the delivery of one claim, which both share.
 *
 * **A delivery failure is a recorded outcome, never a throw.** A use case whose write must still succeed
 * cannot be handed an exception it has to guess about (`C-076`, `packages/platform/AGENTS.md` Discipline),
 * so a transport error, an unrenderable template, a recipient that has gone and a gateway refusal all end
 * as a recorded attempt.
 *
 * **A message is claimed before it is sent.** The claim is a lease the queue enforces: a replay after a
 * stall, a second worker sweeping at the same instant and a retried call all find the row already owned
 * and send nothing. That is what makes the queue safe to retry.
 */
import { addSeconds, toIsoSeconds } from '../../identity/policies.ts';
import type {
  ClaimedNotification,
  NotificationAttempt,
  NotificationCaller,
  NotificationFailure,
  NotificationRecordView,
  OutboundNotification,
} from '../entities.ts';
import { notificationFailure } from '../entities.ts';
import {
  DEFAULT_NOTIFICATION_RETRY_POLICY,
  NOTIFICATION_IDENTIFIER_PATTERN,
  isTerminalState,
  readLimit,
  recordAttempt,
  recordViewOf,
} from '../policies.ts';
import type { NotificationPorts, NotificationRecipient } from '../ports.ts';

/** `dispatchNotification` names one message. */
export interface DispatchNotificationInput {
  readonly notificationId: string;
}

/** One message's state after the call, or the refusal that stopped it being attempted. */
export type DispatchNotificationResult =
  { readonly ok: true; readonly notification: NotificationRecordView } | NotificationFailure;

/** `flushDueNotifications` takes an optional batch size, under the `C-001` page convention. */
export interface FlushDueNotificationsInput {
  readonly limit?: number;
}

/** What one sweep did. Counted by state, so a run of holds is visible without reading rows. */
export interface FlushDueNotificationsResult {
  readonly ok: true;
  readonly attempted: number;
  readonly delivered: number;
  readonly held: number;
  readonly failed: number;
}

/** A queue read, kept as an explicit union so no branch has to guess at `undefined`. */
type ReadOutcome =
  | { readonly kind: 'ok'; readonly record: OutboundNotification | null }
  | { readonly kind: 'failure'; readonly failure: NotificationFailure };

/** A claim attempt, kept as an explicit union for the same reason. */
type ClaimOutcome =
  | { readonly kind: 'ok'; readonly claim: ClaimedNotification | null }
  | { readonly kind: 'failure'; readonly failure: NotificationFailure };

/**
 * Deliver one named message now.
 *
 * @param caller - The service component asking, for the log's correlation.
 * @param deps - The queue, the recipient resolver, the body renderer, the SMS port and the clock.
 * @param input - The message's identifier.
 */
export async function dispatchNotification(
  caller: NotificationCaller,
  deps: NotificationPorts,
  input: DispatchNotificationInput,
): Promise<DispatchNotificationResult> {
  if (!NOTIFICATION_IDENTIFIER_PATTERN.test(input.notificationId)) {
    return notificationFailure(
      'VALIDATION_FAILED',
      'NOTIFICATION_ID_INVALID',
      'That is not a notification identifier.',
      { notificationId: 'PATTERN_MISMATCH' },
    );
  }

  const read = await findById(deps, input.notificationId);
  if (read.kind === 'failure') return read.failure;
  if (read.record === null) return notFound();
  if (isTerminalState(read.record.state)) {
    // A terminal message is answered, not re-sent: a replay of an accepted send must not repeat it.
    return { ok: true, notification: recordViewOf(read.record) };
  }

  const at = toIsoSeconds(deps.clock.now());
  const claimed = await claimById(deps, input.notificationId, at);
  if (claimed.kind === 'failure') return claimed.failure;
  if (claimed.claim === null) {
    // Another dispatcher owns it. Report where the message stands rather than sending it again.
    const current = await findById(deps, input.notificationId);
    if (current.kind === 'failure') return current.failure;
    if (current.record === null) return notFound();
    return { ok: true, notification: recordViewOf(current.record) };
  }

  const updated = await deliverClaimed(deps, claimed.claim);
  if (updated === null) {
    // The lease lapsed while we were sending; the row now belongs to the attempt that replaced ours.
    const current = await findById(deps, input.notificationId);
    if (current.kind === 'failure') return current.failure;
    if (current.record === null) return notFound();
    return { ok: true, notification: recordViewOf(current.record) };
  }
  return { ok: true, notification: recordViewOf(updated) };
}

/**
 * Deliver everything that is due.
 *
 * The sweep is idempotent: a second run at the same instant claims nothing the first run still holds, and
 * a run after a crash claims only what the lapsed lease released.
 *
 * @param caller - The worker or service component asking.
 * @param deps - The port bundle.
 * @param input - How many messages to attempt; default 20, at most 50.
 */
export async function flushDueNotifications(
  caller: NotificationCaller,
  deps: NotificationPorts,
  input: FlushDueNotificationsInput = {},
): Promise<FlushDueNotificationsResult | NotificationFailure> {
  const limit = readLimit(input.limit);
  if (!limit.ok) {
    return notificationFailure(
      'VALIDATION_FAILED',
      'NOTIFICATION_LIMIT_OUT_OF_BAND',
      'That batch size is not available on this queue.',
      { [limit.field]: limit.reason },
    );
  }

  const at = toIsoSeconds(deps.clock.now());
  let claims: readonly ClaimedNotification[];
  try {
    claims = await deps.queue.claimDue({
      at,
      leaseUntil: leaseUntil(at, deps),
      limit: limit.value,
    });
  } catch {
    return notificationFailure(
      'SERVICE_DEGRADED',
      'NOTIFICATION_QUEUE_UNAVAILABLE',
      'The notification queue could not be read, so no notice was attempted.',
    );
  }

  let attempted = 0;
  let delivered = 0;
  let held = 0;
  let failed = 0;
  for (const claim of claims) {
    const updated = await deliverClaimed(deps, claim);
    if (updated === null) continue;
    attempted += 1;
    if (updated.state === 'sent') delivered += 1;
    else if (updated.state === 'failed') failed += 1;
    else if (updated.lastOutcome === 'held') held += 1;
  }
  return { ok: true, attempted, delivered, held, failed };
}

/** One attempt against a message this dispatcher has claimed. */
async function deliverClaimed(
  deps: NotificationPorts,
  claim: ClaimedNotification,
): Promise<OutboundNotification | null> {
  const policy = deps.retry ?? DEFAULT_NOTIFICATION_RETRY_POLICY;
  const at = toIsoSeconds(deps.clock.now());
  const attempt = await attemptFor(deps, claim.record, at, policy);

  return deps.queue.recordAttempt({
    notificationId: claim.record.id,
    leaseToken: claim.leaseToken,
    attempt,
  });
}

/**
 * Produce the attempt one message's delivery call earned.
 *
 * The three failures that are not the gateway's — a recipient that has gone, a template that cannot be
 * rendered, an adapter that threw instead of answering — end the message at once, because a second
 * identical call cannot change any of them. A gateway hold is retried while the budget lasts.
 */
async function attemptFor(
  deps: NotificationPorts,
  record: OutboundNotification,
  at: string,
  policy: Parameters<typeof recordAttempt>[0]['policy'],
): Promise<NotificationAttempt> {
  const base = { at, attemptsBefore: record.attempts, policy };

  let recipient: NotificationRecipient | null;
  try {
    recipient = await deps.recipients.resolve(record.recipient);
  } catch {
    return recordAttempt({
      ...base,
      outcome: 'held',
      messageRef: null,
      cause: 'RECIPIENT_STORE_UNAVAILABLE',
    });
  }
  if (recipient === null) {
    return recordAttempt({ ...base, outcome: 'failed', messageRef: null, cause: 'RECIPIENT_GONE' });
  }

  if (record.channel === 'in_product') {
    // The stored notice is the delivery: there is nothing to send, and nothing to wait for.
    return recordAttempt({ ...base, outcome: 'delivered', messageRef: null, cause: null });
  }

  const destination = recipient.smsDestination;
  if (destination === undefined) {
    return recordAttempt({ ...base, outcome: 'failed', messageRef: null, cause: 'RECIPIENT_GONE' });
  }

  let body: string | null;
  try {
    body = await deps.bodies.render({ record, recipient });
  } catch {
    return recordAttempt({
      ...base,
      outcome: 'held',
      messageRef: null,
      cause: 'TEMPLATE_UNAVAILABLE',
    });
  }
  if (body === null) {
    return recordAttempt({
      ...base,
      outcome: 'failed',
      messageRef: null,
      cause: 'TEMPLATE_UNAVAILABLE',
    });
  }

  try {
    const delivered = await deps.sms.deliver({ destination, body, reference: record.id });
    return recordAttempt({
      ...base,
      outcome: delivered.outcome,
      messageRef: delivered.messageRef,
      cause: delivered.cause,
    });
  } catch {
    // An adapter that throws has broken its own port contract; treat it as an outage, never as a send.
    return recordAttempt({
      ...base,
      outcome: 'held',
      messageRef: null,
      cause: 'PROVIDER_ERROR_UNKNOWN',
    });
  }
}

/** The lease's end for one claim. */
function leaseUntil(at: string, deps: NotificationPorts): string {
  const policy = deps.retry ?? DEFAULT_NOTIFICATION_RETRY_POLICY;
  return addSeconds(at, policy.leaseSeconds);
}

/** Read one message, translating a store failure into the contract's degraded answer. */
async function findById(deps: NotificationPorts, notificationId: string): Promise<ReadOutcome> {
  try {
    return { kind: 'ok', record: await deps.queue.findById(notificationId) };
  } catch {
    return {
      kind: 'failure',
      failure: notificationFailure(
        'SERVICE_DEGRADED',
        'NOTIFICATION_QUEUE_UNAVAILABLE',
        'The notification queue could not be read.',
      ),
    };
  }
}

/** Claim one named message, translating a store failure the same way. */
async function claimById(
  deps: NotificationPorts,
  notificationId: string,
  at: string,
): Promise<ClaimOutcome> {
  try {
    return {
      kind: 'ok',
      claim: await deps.queue.claimById({
        notificationId,
        at,
        leaseUntil: leaseUntil(at, deps),
      }),
    };
  } catch {
    return {
      kind: 'failure',
      failure: notificationFailure(
        'SERVICE_DEGRADED',
        'NOTIFICATION_QUEUE_UNAVAILABLE',
        'The notification queue could not be reached, so nothing was sent.',
      ),
    };
  }
}

/** The one not-found answer this boundary gives. */
function notFound(): NotificationFailure {
  return notificationFailure(
    'NOT_FOUND',
    'NOTIFICATION_NOT_FOUND',
    'No notice matches that identifier.',
  );
}
