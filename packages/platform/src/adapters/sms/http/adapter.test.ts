/**
 * The SMS delivery adapter (`C-076`).
 *
 * The mapping is the whole contract: an acceptance is `delivered`, an outage or timeout is `held`,
 * a refusal is `failed` with a cause that says why. A failure always reports a cause, and only a
 * delivery reports a message reference.
 */
import { describe, expect, it } from 'vitest';

import type { SmsProvider } from '../../../ports/sms-provider.ts';
import { createSmsDeliveryAdapter } from './adapter.ts';

const message = { destination: '+2348012345678', body: 'Your code is 418302' };

const provider = (response: Awaited<ReturnType<SmsProvider['send']>>): SmsProvider => ({
  send: async () => response,
});

describe('SMS delivery adapter', () => {
  it('reports an acceptance as delivered with the gateway reference', async () => {
    const adapter = createSmsDeliveryAdapter(
      provider({ outcome: 'accepted', messageId: 'msg_1', statusCode: 202 }),
      'ODP',
    );
    await expect(adapter.deliver(message)).resolves.toEqual({
      outcome: 'delivered',
      messageRef: 'msg_1',
      cause: null,
    });
  });

  it('holds on an outage or a timeout rather than losing the message', async () => {
    const down = createSmsDeliveryAdapter(
      provider({ outcome: 'unavailable', messageId: null, statusCode: 503 }),
      'ODP',
    );
    await expect(down.deliver(message)).resolves.toEqual({
      outcome: 'held',
      messageRef: null,
      cause: 'PROVIDER_UNAVAILABLE',
    });

    const timedOut = createSmsDeliveryAdapter(
      provider({ outcome: 'timeout', messageId: null, statusCode: null }),
      'ODP',
    );
    await expect(timedOut.deliver(message)).resolves.toEqual({
      outcome: 'held',
      messageRef: null,
      cause: 'PROVIDER_TIMEOUT',
    });
  });

  it('fails a refusal with a cause that names the reason', async () => {
    const auth = createSmsDeliveryAdapter(
      provider({ outcome: 'rejected', messageId: null, statusCode: 401 }),
      'ODP',
    );
    await expect(auth.deliver(message)).resolves.toMatchObject({
      outcome: 'failed',
      cause: 'PROVIDER_AUTHENTICATION_FAILED',
    });

    const invalid = createSmsDeliveryAdapter(
      provider({ outcome: 'rejected', messageId: null, statusCode: 422 }),
      'ODP',
    );
    await expect(invalid.deliver(message)).resolves.toMatchObject({
      outcome: 'failed',
      cause: 'PROVIDER_REQUEST_INVALID',
    });

    const rejected = createSmsDeliveryAdapter(
      provider({ outcome: 'rejected', messageId: null, statusCode: 400 }),
      'ODP',
    );
    await expect(rejected.deliver(message)).resolves.toMatchObject({
      outcome: 'failed',
      cause: 'PROVIDER_REQUEST_INVALID',
    });
  });

  it('uses the deployment sender when the caller does not name one', async () => {
    let sentSender: string | null = null;
    const adapter = createSmsDeliveryAdapter(
      {
        send: async (outbound) => {
          sentSender = outbound.senderId;
          return { outcome: 'accepted', messageId: 'msg_1', statusCode: 202 };
        },
      },
      'ODP',
    );

    await adapter.deliver(message);
    expect(sentSender).toBe('ODP');
  });

  it('never puts the destination or the body in a result', async () => {
    const adapter = createSmsDeliveryAdapter(
      provider({ outcome: 'rejected', messageId: null, statusCode: 500 }),
      'ODP',
    );
    const result = JSON.stringify(await adapter.deliver(message));
    expect(result).not.toContain('+2348012345678');
    expect(result).not.toContain('418302');
  });
});
