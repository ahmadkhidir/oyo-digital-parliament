/**
 * Queueing one notice (`C-076` `enqueue`).
 *
 * The call is the whole of what a producing feature needs: it is told the message is queued and when it
 * will first be attempted, and it is never made to wait on a gateway. `C-076` is explicit that a channel
 * outage must not fail the write that produced the notice — a decision that publishes is published even
 * when the author's SMS cannot leave the building.
 *
 * Three answers are the caller's to handle:
 *
 * - `VALIDATION_FAILED` when the channel, the template, the recipient reference, the dedupe key or a
 *   payload key is not one the boundary accepts. A payload key outside the template's own set is refused
 *   rather than dropped, because the queue is durable and a stored credential cannot be unstored.
 * - `NOT_FOUND` when the recipient reference names no live record: an anonymised account (`FEAT-012`) or
 *   a pending registration that has been discarded has no one to notify.
 * - `SERVICE_DEGRADED` when the store itself cannot take the write. Nothing is queued, and the caller
 *   knows it rather than believing a notice is on its way.
 *
 * A dedupe key that is already stored returns the stored message unchanged, so a replayed publish, a
 * retried worker run and a double-submitted form all queue one notice and not two.
 */
import { toIsoSeconds } from '../../identity/policies.ts';
import type {
  NotificationCaller,
  NotificationChannel,
  NotificationDeliveryState,
  NotificationFailure,
  NotificationRecipientReference,
  OutboundNotification,
} from '../entities.ts';
import { notificationFailure } from '../entities.ts';
import {
  DEFAULT_NOTIFICATION_RETRY_POLICY,
  deliveryStateOf,
  firstAttemptAt,
  readChannel,
  readDedupeKey,
  readPayload,
  readRecipient,
  readTemplate,
  type Reading,
} from '../policies.ts';
import type { NotificationPorts } from '../ports.ts';

/** The `C-076` `enqueue` arguments, as an untrusted caller supplies them. */
export interface EnqueueNotificationInput {
  readonly channel: unknown;
  readonly template: unknown;
  readonly recipient: unknown;
  readonly payload?: unknown;
  readonly dedupeKey: unknown;
}

/** The queued message's delivery state, or the refusal that stopped it. */
export type EnqueueNotificationResult =
  { readonly ok: true; readonly notification: NotificationDeliveryState } | NotificationFailure;

/** Collects the frozen field reasons of every reading that failed. */
function fieldsOf(
  readings: readonly Reading<unknown>[],
): Record<string, NotificationFailure['fields'][string]> {
  const fields: Record<string, NotificationFailure['fields'][string]> = {};
  for (const reading of readings) {
    if (!reading.ok) fields[reading.field] = reading.reason;
  }
  return fields;
}

/**
 * Queue one notice.
 *
 * @param caller - The service component asking, for the log's correlation.
 * @param deps - The queue, the recipient resolver, the clock and the identifier generator.
 * @param input - Channel, template, recipient reference, payload and the caller's dedupe key.
 */
export async function enqueueNotification(
  caller: NotificationCaller,
  deps: NotificationPorts,
  input: EnqueueNotificationInput,
): Promise<EnqueueNotificationResult> {
  const channel = readChannel(input.channel);
  const template = readTemplate(input.template);
  const recipient = readRecipient(input.recipient);
  const dedupeKey = readDedupeKey(input.dedupeKey);
  const payload = template.ok
    ? readPayload(template.value, input.payload)
    : ({ ok: true, value: {} } as const);

  const fields = fieldsOf([channel, template, recipient, dedupeKey, payload]);
  if (Object.keys(fields).length > 0) {
    return notificationFailure(
      'VALIDATION_FAILED',
      'NOTIFICATION_INVALID',
      'The notice could not be queued because a field is missing or malformed.',
      fields,
    );
  }
  if (!channel.ok || !template.ok || !recipient.ok || !dedupeKey.ok || !payload.ok) {
    // Unreachable after the merge above; it narrows the readings for the compiler.
    return notificationFailure(
      'VALIDATION_FAILED',
      'NOTIFICATION_INVALID',
      'The notice could not be queued because a field is missing or malformed.',
    );
  }

  // `C-076`: an unknown or anonymised recipient is NOT_FOUND. The destination is read here only to
  // prove the recipient is deliverable; it is not kept, and the send resolves it again.
  const resolved = await resolveRecipient(deps, recipient.value, channel.value);
  if (resolved !== null) return resolved;

  const policy = deps.retry ?? DEFAULT_NOTIFICATION_RETRY_POLICY;
  const createdAt = toIsoSeconds(deps.clock.now());
  const record: OutboundNotification = {
    id: deps.identifiers.next('ntf'),
    channel: channel.value,
    template: template.value,
    recipient: recipient.value,
    payload: payload.value,
    dedupeKey: dedupeKey.value,
    state: 'queued',
    attempts: 0,
    nextAttemptAt: firstAttemptAt(createdAt, policy),
    createdAt,
  };

  try {
    const stored = await deps.queue.enqueue(record);
    // A dedupe key already present answers with the stored message, its state unchanged.
    return { ok: true, notification: deliveryStateOf(stored.record) };
  } catch {
    return notificationFailure(
      'SERVICE_DEGRADED',
      'NOTIFICATION_QUEUE_UNAVAILABLE',
      'The notification queue could not be reached, so nothing was queued.',
    );
  }
}

/**
 * Resolve the recipient, refusing when there is nobody to notify.
 *
 * An `sms` message needs a destination; an `in_product` message only needs the record to exist, because
 * the stored notice is what the member reads.
 */
async function resolveRecipient(
  deps: NotificationPorts,
  recipient: NotificationRecipientReference,
  channel: NotificationChannel,
): Promise<NotificationFailure | null> {
  let resolved;
  try {
    resolved = await deps.recipients.resolve(recipient);
  } catch {
    return notificationFailure(
      'SERVICE_DEGRADED',
      'RECIPIENT_STORE_UNAVAILABLE',
      'The recipient could not be read, so nothing was queued.',
    );
  }
  if (resolved === null || (channel === 'sms' && resolved.smsDestination === undefined)) {
    return notificationFailure(
      'NOT_FOUND',
      'RECIPIENT_NOT_FOUND',
      'No live record matches that recipient, so no notice was queued.',
    );
  }
  return null;
}
