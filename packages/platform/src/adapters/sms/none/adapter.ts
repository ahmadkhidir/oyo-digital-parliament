/**
 * The SMS port when no gateway is configured (`SMS_PROVIDER=none`).
 *
 * It holds every message with `PROVIDER_NOT_CONFIGURED` rather than reporting a delivery it did not
 * make. A held message is retained by the notification boundary and retried when a gateway is
 * configured, which is the only honest answer when the deployment has no SMS account yet — and it
 * keeps a one-time code from being silently lost (`C-076`).
 *
 * @module adapters/sms/none/adapter
 */
import type {
  SmsDeliveryPort,
  SmsDeliveryResult,
} from '../../../../../domain/src/ports/notifications.ts';

/** A delivery port for a deployment with no SMS provider. */
export function createUnconfiguredSmsDelivery(): SmsDeliveryPort {
  return {
    deliver: async (): Promise<SmsDeliveryResult> => ({
      outcome: 'held',
      messageRef: null,
      cause: 'PROVIDER_NOT_CONFIGURED',
    }),
  };
}
