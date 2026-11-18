/**
 * The notification boundary (`C-076`): one-time codes, decision notices, appeal outcomes, session
 * reminders and data-request outcomes.
 *
 * The module owns three things and refuses a fourth. It owns the **queue's policy** — what a payload may
 * carry, how many attempts a message gets, how long the wait between them is, and when a hold becomes a
 * failure. It owns the **dispatch** — one attempt per call, recorded whether it worked or not, never
 * thrown into the write that produced the notice. It owns the **reads** — one message's state and the
 * held queue during an outage. It refuses to own the message: rendering copy belongs to the platform
 * adapter, the outstanding one-time code belongs to the code store, and neither is stored here.
 *
 * `packages/domain/AGENTS.md` requires every state-changing use case to append an audit event. The
 * boundary is the exception, deliberately and for one reason: `C-076` names no audit anchor and `C-090`'s
 * record needs an actor — a person or a staff user — where a delivery attempt has neither. A notice is
 * internal delivery infrastructure, not a change to the record; the state change that *caused* it (a
 * decision publishing, a registration starting) is audited by the use case that made it.
 */
export {
  NOTIFICATION_ATTEMPT_OUTCOMES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_RECIPIENT_KINDS,
  NOTIFICATION_STATES,
  NOTIFICATION_TEMPLATES,
  notificationFailure,
  type ClaimedNotification,
  type NotificationAttempt,
  type NotificationAttemptOutcome,
  type NotificationCaller,
  type NotificationChannel,
  type NotificationDeliveryState,
  type NotificationFailure,
  type NotificationFailureCode,
  type NotificationFieldReason,
  type NotificationRecipientKind,
  type NotificationRecipientReference,
  type NotificationRecordView,
  type NotificationState,
  type NotificationTemplate,
  type OutboundNotification,
} from './entities.ts';

export {
  DEFAULT_NOTIFICATION_RETRY_POLICY,
  NOTIFICATION_DEDUPE_KEY_PATTERN,
  NOTIFICATION_IDENTIFIER_PATTERN,
  NOTIFICATION_PAGE_DEFAULT_LIMIT,
  NOTIFICATION_PAGE_MAX_LIMIT,
  NOTIFICATION_PAYLOAD_VALUE_MAX_LENGTH,
  PAYLOAD_KEYS_BY_TEMPLATE,
  RECIPIENT_PREFIX_BY_KIND,
  deliveryStateOf,
  firstAttemptAt,
  isHeld,
  isNotificationChannel,
  isNotificationRecipientKind,
  isNotificationState,
  isNotificationTemplate,
  isTerminalState,
  nextAttemptAt,
  readChannel,
  readDedupeKey,
  readLimit,
  readPayload,
  readRecipient,
  readTemplate,
  recordAttempt,
  recordViewOf,
  retryDelaySeconds,
  type NotificationRetryPolicy,
} from './policies.ts';

export type {
  NotificationBodyPort,
  NotificationPorts,
  NotificationRecipient,
  NotificationRecipientPort,
  OutboundQueuePort,
} from './ports.ts';

export {
  enqueueNotification,
  type EnqueueNotificationInput,
  type EnqueueNotificationResult,
} from './use-cases/enqueue-notification.ts';
export {
  dispatchNotification,
  flushDueNotifications,
  type DispatchNotificationInput,
  type DispatchNotificationResult,
  type FlushDueNotificationsInput,
  type FlushDueNotificationsResult,
} from './use-cases/dispatch-notification.ts';
export {
  getDeliveryState,
  type GetDeliveryStateInput,
  type GetDeliveryStateResult,
} from './use-cases/get-delivery-state.ts';
export {
  listHeldNotifications,
  type ListHeldNotificationsInput,
  type ListHeldNotificationsResult,
} from './use-cases/list-held-notifications.ts';
