/**
 * A vendor-neutral HTTP SMS gateway client (`C-076`).
 *
 * The specification names no gateway, so this client speaks one documented JSON shape: the adapter
 * posts `{ to, body, sender }` to the configured endpoint with a bearer credential and reads an
 * `id` back. A Nigerian gateway with a different shape becomes a sibling directory under
 * `src/adapters/sms/` and nothing above the provider seam changes.
 *
 * The destination and the body are never logged, never included in an error and never stored on the
 * object. A gateway that does not answer is reported as unavailable or timed out, never as accepted.
 *
 * @module adapters/sms/http/client
 */
import { HttpTimeoutError, type HttpClient } from '../../../ports/http.ts';
import type {
  SmsProvider,
  SmsProviderMessage,
  SmsProviderResponse,
} from '../../../ports/sms-provider.ts';

/** What the client needs from configuration. */
export interface HttpSmsClientConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly http: HttpClient;
  readonly timeoutMs: number;
}

/**
 * Read the gateway's message id without trusting its shape.
 *
 * A malformed body is not a delivery failure by itself — the status said accepted — so the id is
 * optional and no raw payload is retained.
 */
function messageIdOf(body: Uint8Array): string | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    if (typeof parsed === 'object' && parsed !== null) {
      const id = (parsed as { id?: unknown }).id;
      if (typeof id === 'string' && id !== '') return id;
    }
  } catch {
    // A body that is not JSON carries no id; the status is still the delivery answer.
  }
  return null;
}

/** Create the gateway client. */
export function createHttpSmsProvider(config: HttpSmsClientConfig): SmsProvider {
  return {
    async send(message: SmsProviderMessage): Promise<SmsProviderResponse> {
      const payload = JSON.stringify({
        to: message.to,
        body: message.body,
        sender: message.senderId,
      });

      let response;
      try {
        response = await config.http.send({
          method: 'POST',
          url: config.endpoint,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            authorization: `Bearer ${config.apiKey}`,
          },
          body: new TextEncoder().encode(payload),
          timeoutMs: config.timeoutMs,
        });
      } catch (error) {
        return {
          outcome: error instanceof HttpTimeoutError ? 'timeout' : 'unavailable',
          messageId: null,
          statusCode: null,
        };
      }

      if (response.status >= 200 && response.status < 300) {
        return {
          outcome: 'accepted',
          messageId: messageIdOf(response.body),
          statusCode: response.status,
        };
      }

      // 401/403 and 400/422 are the caller's problem to classify, but they are refusals: retrying
      // the identical request changes nothing. 408, 429 and 5xx are a channel problem, so the
      // message is held rather than failed.
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        return { outcome: 'unavailable', messageId: null, statusCode: response.status };
      }
      return { outcome: 'rejected', messageId: null, statusCode: response.status };
    },
  };
}
