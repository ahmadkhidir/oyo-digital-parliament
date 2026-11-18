/**
 * Reading the held queue (`C-076` `listHeld`).
 *
 * The read answers the operator's question during an outage: which messages is the channel holding, how
 * many times has each been tried, and when is the next attempt due. It is the reason `operations.md`'s
 * "provider switch within two hours, pending registrations preserved" can be checked rather than
 * asserted.
 *
 * Only held messages are listed: queued with a held last outcome. A message that has never been attempted
 * is not held — it is simply waiting its turn — and a failed or sent message is not holding anything.
 */
import type {
  NotificationCaller,
  NotificationFailure,
  NotificationRecordView,
} from '../entities.ts';
import { notificationFailure } from '../entities.ts';
import { readLimit, recordViewOf } from '../policies.ts';
import type { NotificationPorts } from '../ports.ts';

/** The `listHeld` arguments. */
export interface ListHeldNotificationsInput {
  readonly cursor?: string;
  readonly limit?: number;
}

/** One page of held messages, or the refusal that stopped the read. */
export type ListHeldNotificationsResult =
  | {
      readonly ok: true;
      readonly notifications: readonly NotificationRecordView[];
      readonly nextCursor: string | null;
    }
  | NotificationFailure;

/**
 * List the messages the channel is holding.
 *
 * @param caller - The service component asking.
 * @param deps - The queue port.
 * @param input - An optional cursor and page size; default 20, at most 50 (`C-001`).
 */
export async function listHeldNotifications(
  caller: NotificationCaller,
  deps: NotificationPorts,
  input: ListHeldNotificationsInput = {},
): Promise<ListHeldNotificationsResult> {
  const limit = readLimit(input.limit);
  if (!limit.ok) {
    return notificationFailure(
      'VALIDATION_FAILED',
      'NOTIFICATION_LIMIT_OUT_OF_BAND',
      'That page size is not available on this queue.',
      { [limit.field]: limit.reason },
    );
  }

  let page: Awaited<ReturnType<NotificationPorts['queue']['listHeld']>>;
  try {
    page = await deps.queue.listHeld({
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: limit.value,
    });
  } catch {
    return notificationFailure(
      'SERVICE_DEGRADED',
      'NOTIFICATION_QUEUE_UNAVAILABLE',
      'The notification queue could not be read.',
    );
  }

  return {
    ok: true,
    notifications: page.rows.map(recordViewOf),
    nextCursor: page.nextCursor,
  };
}
