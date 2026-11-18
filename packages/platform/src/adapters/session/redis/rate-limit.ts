/**
 * The fixed-window limiter over Redis counters (`NFR-027`, `C-001`).
 *
 * One bucket, one subject and one window make one key, and the window index is part of the key rather
 * than an expiry on a shared counter. A new window is a new key, so a counter cannot be reset by a
 * slow request, and the previous window ages out on its own.
 *
 * The subject is digested before it becomes a key: a telephone number, a source address and a member
 * identifier are all personal values, and none of them is written to Redis in the clear.
 *
 * The caps are operator policy and arrive through the composition root. The bucket name is the
 * caller's, and a bucket with no policy is refused rather than silently unlimited, so a new call site
 * cannot ship before its cap does.
 *
 * @module adapters/session/redis/rate-limit
 */
import type { RateLimitPort } from '../../../../../domain/src/identity/ports.ts';
import type { ClockPort } from '../../../../../domain/src/ports/clock.ts';
import type {
  RateLimitOutcome,
  RateLimitRequest,
} from '../../../../../domain/src/ports/session.ts';
import type { SessionStore } from '../../../ports/session-store.ts';
import { digestSubject, rateLimitKey } from './keys.ts';

/** One bucket's cap and window, as the operator configured it. */
export interface RateLimitPolicy {
  /** Calls allowed in one window. Positive. */
  readonly limit: number;
  /** The fixed window's length in seconds. Positive. */
  readonly windowSeconds: number;
}

/** The limiter as the application sees it, including the header values `C-001` requires. */
export interface RateLimitAdapter extends RateLimitPort {
  consume(input: RateLimitRequest): Promise<RateLimitOutcome>;
}

/** What the limiter needs. */
export interface FixedWindowRateLimiterOptions {
  readonly store: SessionStore;
  readonly clock: ClockPort;
  /** The cap for each bucket the use cases name. A missing bucket is a configuration defect. */
  readonly policies: Readonly<Record<string, RateLimitPolicy>>;
  /**
   * An optional HMAC key for the subject digest.
   *
   * A telephone number belongs to a space small enough to enumerate, so a keyed digest is preferred
   * where one is configured; without it the digest is still one-way.
   */
  readonly subjectKey?: string;
}

/**
 * Create the limiter.
 *
 * @param options - The store, the clock, the per-bucket caps and an optional digest key.
 */
export function createFixedWindowRateLimiter(
  options: FixedWindowRateLimiterOptions,
): RateLimitAdapter {
  const { store, clock, policies } = options;

  return {
    async consume(input) {
      const policy = policies[input.bucket];
      if (policy === undefined) {
        throw new Error(`no rate-limit cap is configured for the "${input.bucket}" bucket`);
      }
      const cap = input.fixedLimit ?? policy.limit;
      if (!Number.isSafeInteger(cap) || cap < 1) {
        throw new TypeError('a rate-limit cap must be a positive whole number');
      }
      if (!Number.isSafeInteger(policy.windowSeconds) || policy.windowSeconds < 1) {
        throw new TypeError('a rate-limit window must be a positive whole number of seconds');
      }

      const now = clock.now().getTime();
      const windowMs = policy.windowSeconds * 1000;
      const windowIndex = Math.floor(now / windowMs);
      const resetAt = new Date((windowIndex + 1) * windowMs).toISOString();

      const digest =
        options.subjectKey === undefined
          ? digestSubject(input.subject)
          : digestSubject(input.subject, options.subjectKey);

      // Twice the window: the counter is created inside its own window, and a clock that steps back a
      // little still finds it. Nothing reads a counter from an older window.
      const count = await store.increment(
        rateLimitKey(input.bucket, digest, windowIndex),
        policy.windowSeconds * 2,
      );

      const allowed = count <= cap;
      return {
        allowed,
        retryAfterSeconds: allowed
          ? 0
          : Math.max(1, Math.ceil(((windowIndex + 1) * windowMs - now) / 1000)),
        limit: cap,
        remaining: Math.max(0, cap - count),
        resetAt,
      };
    },
  };
}
