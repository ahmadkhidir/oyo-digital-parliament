/**
 * Bounded transport retry for SMS delivery (`C-076`).
 *
 * One message, up to a configured number of attempts, with exponential backoff capped at a ceiling.
 * It retries only a `held` outcome: a `failed` outcome means the gateway refused the message, and
 * sending it again unchanged cannot help. A `delivered` outcome returns immediately.
 *
 * This decorator is transport, not policy. It does not decide whether a message is queued, held for
 * a human, deduplicated against an earlier send or abandoned; the notification boundary owns those,
 * and it sees the final outcome plus the attempt count through the result. Sleep is injected so the
 * schedule is proven in a test without waiting, and the delays are a plain geometric series so an
 * operator can predict them from the two configured numbers.
 *
 * @module adapters/sms/bounded-retry
 */
import type {
  SmsDeliveryPort,
  SmsDeliveryResult,
  SmsMessage,
} from '../../../../domain/src/ports/notifications.ts';

/** The retry budget, from configuration. */
export interface BoundedRetryPolicy {
  /** Attempts including the first. `C-076` holds rather than loses a message after the budget. */
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Waits before the next attempt. Injected so a test does not sleep. */
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/** Delays for each retry after the first attempt: base, 2×base, 4×base, capped. */
export function backoffSchedule(
  policy: Pick<BoundedRetryPolicy, 'maxAttempts' | 'baseDelayMs' | 'maxDelayMs'>,
): readonly number[] {
  const delays: number[] = [];
  for (let attempt = 1; attempt < policy.maxAttempts; attempt += 1) {
    delays.push(Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs));
  }
  return delays;
}

/** The real waiter. Only the composition root uses it; tests inject their own. */
export const waitWithTimer = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * Wrap a delivery port with a bounded retry.
 *
 * @param port - The underlying delivery port.
 * @param policy - Attempts, first delay, ceiling and the waiter.
 */
export function withBoundedBackoff(
  port: SmsDeliveryPort,
  policy: BoundedRetryPolicy,
): SmsDeliveryPort {
  const delays = backoffSchedule(policy);
  const sleep = policy.sleep ?? waitWithTimer;

  return {
    async deliver(message: SmsMessage): Promise<SmsDeliveryResult> {
      let result = await port.deliver(message);
      for (const delay of delays) {
        if (result.outcome !== 'held') return result;
        await sleep(delay);
        result = await port.deliver(message);
      }
      return result;
    },
  };
}
