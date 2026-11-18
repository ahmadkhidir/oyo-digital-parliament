/**
 * Bounded transport retry (`C-076`).
 *
 * The schedule is a geometric series with a ceiling, the attempt count is bounded, and only a `held`
 * outcome is retried. The waiter is injected, so the test asserts the delays without waiting and
 * proves the loop stops at the configured attempt count.
 */
import { describe, expect, it } from 'vitest';

import type {
  SmsDeliveryPort,
  SmsDeliveryResult,
  SmsMessage,
} from '../../../../domain/src/ports/notifications.ts';
import { backoffSchedule, withBoundedBackoff } from './bounded-retry.ts';

const message: SmsMessage = { destination: '+2348012345678', body: 'code' };

/** A port that replays outcomes and counts calls. */
function scriptedPort(...outcomes: readonly SmsDeliveryResult[]): {
  port: SmsDeliveryPort;
  calls: () => number;
} {
  let index = 0;
  return {
    port: {
      async deliver() {
        const outcome = outcomes[Math.min(index, outcomes.length - 1)];
        index += 1;
        if (outcome === undefined) throw new Error('no scripted outcome');
        return outcome;
      },
    },
    calls: () => index,
  };
}

const held: SmsDeliveryResult = {
  outcome: 'held',
  messageRef: null,
  cause: 'PROVIDER_UNAVAILABLE',
};
const delivered: SmsDeliveryResult = { outcome: 'delivered', messageRef: 'm1', cause: null };
const failed: SmsDeliveryResult = {
  outcome: 'failed',
  messageRef: null,
  cause: 'PROVIDER_REJECTED',
};

describe('bounded SMS retry', () => {
  it('computes a capped geometric schedule', () => {
    expect(backoffSchedule({ maxAttempts: 4, baseDelayMs: 500, maxDelayMs: 1500 })).toEqual([
      500, 1000, 1500,
    ]);
    expect(backoffSchedule({ maxAttempts: 1, baseDelayMs: 500, maxDelayMs: 1500 })).toEqual([]);
  });

  it('retries a held message until it is delivered', async () => {
    const { port, calls } = scriptedPort(held, held, delivered);
    const delays: number[] = [];
    const retrying = withBoundedBackoff(port, {
      maxAttempts: 3,
      baseDelayMs: 500,
      maxDelayMs: 4000,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    });

    await expect(retrying.deliver(message)).resolves.toEqual(delivered);
    expect(calls()).toBe(3);
    expect(delays).toEqual([500, 1000]);
  });

  it('stops at the attempt budget and returns the held result', async () => {
    const { port, calls } = scriptedPort(held);
    const retrying = withBoundedBackoff(port, {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      sleep: async () => {},
    });

    await expect(retrying.deliver(message)).resolves.toEqual(held);
    expect(calls()).toBe(3);
  });

  it('does not retry a refusal', async () => {
    const { port, calls } = scriptedPort(failed);
    const retrying = withBoundedBackoff(port, {
      maxAttempts: 5,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      sleep: async () => {
        throw new Error('must not wait');
      },
    });

    await expect(retrying.deliver(message)).resolves.toEqual(failed);
    expect(calls()).toBe(1);
  });
});
