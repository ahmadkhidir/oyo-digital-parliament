/**
 * The SMS delivery adapter (`C-076`).
 *
 * One delivery attempt, translated: a gateway acceptance is `delivered`, an outage or timeout is
 * `held`, and a refusal is `failed`. It carries no retry loop, no queue and no deduplication — those
 * belong to the notification boundary, which alone knows whether a second attempt is safe
 * (`packages/platform/AGENTS.md` Discipline). {@link withBoundedBackoff} is the opt-in transport
 * retry the composition root applies when a deployment wants it; the hold policy still lives above.
 *
 * No destination number or message body appears in a result, an error or a log line.
 *
 * @module adapters/sms/http/adapter
 */
import type {
  SmsDeliveryCause,
  SmsDeliveryPort,
  SmsDeliveryResult,
  SmsMessage,
} from '../../../../../domain/src/ports/notifications.ts';
import type { SmsProvider, SmsProviderResponse } from '../../../ports/sms-provider.ts';

/** The cause table, kept beside the mapping so a new provider outcome has one place to land. */
function failedCause(response: SmsProviderResponse): SmsDeliveryCause {
  if (response.statusCode === 401 || response.statusCode === 403) {
    return 'PROVIDER_AUTHENTICATION_FAILED';
  }
  if (response.statusCode === 400 || response.statusCode === 404 || response.statusCode === 422) {
    return 'PROVIDER_REQUEST_INVALID';
  }
  return 'PROVIDER_REJECTED';
}

/**
 * Create the delivery adapter.
 *
 * @param provider - The gateway seam. Only an acceptance produces `delivered`.
 * @param senderId - The approved sender name for this deployment.
 */
export function createSmsDeliveryAdapter(provider: SmsProvider, senderId: string): SmsDeliveryPort {
  return {
    async deliver(message: SmsMessage): Promise<SmsDeliveryResult> {
      const response = await provider.send({
        to: message.destination,
        body: message.body,
        senderId: message.senderId ?? senderId,
        ...(message.reference === undefined ? {} : { reference: message.reference }),
      });

      switch (response.outcome) {
        case 'accepted':
          return { outcome: 'delivered', messageRef: response.messageId, cause: null };
        case 'timeout':
          return { outcome: 'held', messageRef: null, cause: 'PROVIDER_TIMEOUT' };
        case 'unavailable':
          return { outcome: 'held', messageRef: null, cause: 'PROVIDER_UNAVAILABLE' };
        case 'rejected':
          return { outcome: 'failed', messageRef: null, cause: failedCause(response) };
        default:
          return { outcome: 'held', messageRef: null, cause: 'PROVIDER_ERROR_UNKNOWN' };
      }
    },
  };
}
