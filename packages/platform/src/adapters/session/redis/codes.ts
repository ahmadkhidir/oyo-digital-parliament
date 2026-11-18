/**
 * The one-time-code store over Redis (`NFR-020`, `C-002` to `C-006`).
 *
 * The code value never reaches a key, a log or a stored record: the store holds a SHA-256 digest and
 * the comparison runs in constant time. Attempt counting, the cooldown that follows the third wrong
 * code, and the resend timer's clock live beside the code, because an attempt limit without the code
 * it counts is meaningless.
 *
 * A dispatch that the gateway did not accept discards the stored code and throws. The caller then
 * answers `delayed` at registration and `SERVICE_DEGRADED` on a resend, exactly as `C-002` and `C-004`
 * state, and the resident is never left with digits that were stored but never sent.
 *
 * @module adapters/session/redis/codes
 */
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';

import type { Locale } from '../../../../../domain/src/identity/entities.ts';
import type {
  CodeAttempts,
  CodeDelivery,
  VerificationCodePort,
} from '../../../../../domain/src/identity/ports.ts';
import type { ClockPort } from '../../../../../domain/src/ports/clock.ts';
import type { SmsDeliveryPort } from '../../../../../domain/src/ports/notifications.ts';
import type { SessionStore } from '../../../ports/session-store.ts';
import { renderVerificationCodeMessage } from '../messages.ts';
import { verificationAttemptsKey, verificationCodeKey, verificationCooldownKey } from './keys.ts';

/** The record one code leaves behind. The digits themselves are not in it. */
interface CodeRecord {
  readonly v: 1;
  readonly digest: string;
}

/** Read the digest out of a stored record, treating a malformed one as an absent code. */
function storedDigest(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { readonly v?: unknown; readonly digest?: unknown };
    return parsed.v === 1 && typeof parsed.digest === 'string' ? parsed.digest : null;
  } catch {
    return null;
  }
}

/** The gateway did not accept the dispatch. The stable cause names the failure, never the number. */
export class CodeDeliveryError extends Error {
  /** One of the SMS adapter's stable causes, or `null` when the gateway reported no reason. */
  override readonly cause: string | null;

  constructor(cause: string | null) {
    super('the one-time code could not be delivered');
    this.name = 'CodeDeliveryError';
    this.cause = cause;
  }
}

/** A six-digit code, generated from the CSPRNG rather than `Math.random`. */
function issueCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** The stored form of a code. A six-digit space is small, so the digest is never printed either. */
function digestCode(code: string): string {
  return createHash('sha256').update(`odp:v1:code:${code}`, 'utf8').digest('hex');
}

/** Compare two hex digests without leaking how many characters matched. */
function digestsMatch(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

/** What the code store needs. */
export interface VerificationCodeStoreOptions {
  readonly store: SessionStore;
  readonly clock: ClockPort;
  readonly sms: SmsDeliveryPort;
  /** How long a code works, in seconds. Rendered into the message so the two cannot disagree. */
  readonly ttlSeconds: number;
  /** The message renderer. Injected so the notification boundary can own the copy later. */
  readonly renderMessage?: (input: {
    readonly locale: Locale;
    readonly code: string;
    readonly expiresInMinutes: number;
  }) => string;
}

/**
 * Create the one-time-code store.
 *
 * @param options - The store, the clock, the gateway, the lifetime and an optional renderer.
 */
export function createVerificationCodeStore(
  options: VerificationCodeStoreOptions,
): VerificationCodePort {
  const { store, clock, sms } = options;
  const renderMessage = options.renderMessage ?? renderVerificationCodeMessage;

  const resetAttempts = async (targetId: string): Promise<void> => {
    try {
      await store.delete([verificationAttemptsKey(targetId), verificationCooldownKey(targetId)]);
    } catch {
      // A stale counter can only make the next attempt stricter, never looser.
    }
  };

  return {
    async issue(input): Promise<CodeDelivery> {
      const code = issueCode();
      const codeKey = verificationCodeKey(input.targetId);
      const record: CodeRecord = { v: 1, digest: digestCode(code) };

      await resetAttempts(input.targetId);
      await store.set(codeKey, JSON.stringify(record), options.ttlSeconds);

      const delivery = await sms.deliver({
        destination: input.telephoneNumber,
        body: renderMessage({
          locale: input.locale,
          code,
          expiresInMinutes: Math.max(1, Math.round(options.ttlSeconds / 60)),
        }),
      });

      if (delivery.outcome !== 'delivered') {
        // Nothing was sent, so nothing may be accepted: drop the code before reporting the hold.
        try {
          await store.delete([codeKey]);
        } catch {
          // The TTL removes it; the caller is being told the dispatch did not happen either way.
        }
        throw new CodeDeliveryError(delivery.cause);
      }

      return { status: 'sent', channel: 'sms' };
    },

    async matches(targetId, code) {
      const digest = storedDigest(await store.get(verificationCodeKey(targetId)));
      if (digest === null) return false;
      return digestsMatch(digest, digestCode(code));
    },

    async consume(targetId) {
      await store.delete([
        verificationCodeKey(targetId),
        verificationAttemptsKey(targetId),
        verificationCooldownKey(targetId),
      ]);
    },

    async readAttempts(targetId): Promise<CodeAttempts> {
      const raw = await store.get(verificationAttemptsKey(targetId));
      const attempts = raw === null ? 0 : Number(raw);
      const cooldownUntil = await store.get(verificationCooldownKey(targetId));
      const live =
        cooldownUntil !== null && Date.parse(cooldownUntil) > clock.now().getTime()
          ? { cooldownUntil }
          : {};
      return { attempts: Number.isSafeInteger(attempts) ? attempts : 0, ...live };
    },

    async recordFailure(targetId) {
      return store.increment(verificationAttemptsKey(targetId), options.ttlSeconds);
    },

    async startCooldown(targetId, until) {
      const seconds = Math.ceil((Date.parse(until) - clock.now().getTime()) / 1000);
      if (seconds < 1) return;
      await store.set(verificationCooldownKey(targetId), until, seconds);
    },
  };
}
