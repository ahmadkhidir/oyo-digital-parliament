/**
 * Reading one notice's delivery state (`C-076` `getDeliveryState`).
 *
 * The read exists so a producing feature, an operator console or a test can answer "did that notice
 * leave?" without holding a reference to the row. It reports the same six fields `enqueue` returns plus
 * the times an operator needs to judge a channel; it never reports the destination, the body or the code,
 * because the queue holds none of them.
 */
import type {
  NotificationCaller,
  NotificationFailure,
  NotificationRecordView,
} from '../entities.ts';
import { notificationFailure } from '../entities.ts';
import { NOTIFICATION_IDENTIFIER_PATTERN, recordViewOf } from '../policies.ts';
import type { NotificationPorts } from '../ports.ts';

/** The `getDeliveryState` arguments. */
export interface GetDeliveryStateInput {
  readonly notificationId: string;
}

/** The message's state, or the refusal that stopped the read. */
export type GetDeliveryStateResult =
  { readonly ok: true; readonly notification: NotificationRecordView } | NotificationFailure;

/**
 * Read one notice's delivery state.
 *
 * @param caller - The service component asking.
 * @param deps - The queue port. This use case has no other effect.
 * @param input - The message's identifier.
 */
export async function getDeliveryState(
  caller: NotificationCaller,
  deps: NotificationPorts,
  input: GetDeliveryStateInput,
): Promise<GetDeliveryStateResult> {
  if (!NOTIFICATION_IDENTIFIER_PATTERN.test(input.notificationId)) {
    return notificationFailure(
      'VALIDATION_FAILED',
      'NOTIFICATION_ID_INVALID',
      'That is not a notification identifier.',
      { notificationId: 'PATTERN_MISMATCH' },
    );
  }

  let record;
  try {
    record = await deps.queue.findById(input.notificationId);
  } catch {
    return notificationFailure(
      'SERVICE_DEGRADED',
      'NOTIFICATION_QUEUE_UNAVAILABLE',
      'The notification queue could not be read.',
    );
  }
  if (record === null) {
    return notificationFailure(
      'NOT_FOUND',
      'NOTIFICATION_NOT_FOUND',
      'No notice matches that identifier.',
    );
  }
  return { ok: true, notification: recordViewOf(record) };
}
