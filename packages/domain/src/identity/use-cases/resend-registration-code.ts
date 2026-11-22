/**
 * Resending a registration code (`C-004`, `FEAT-001`, `NFR-027`, `C-076`).
 *
 * Issues one new code against the same pending registration and never extends the twenty-four-hour
 * window: a resident who leaves and returns keeps their place, but the held form still expires. The
 * code leaves through the notification boundary like the first one, so one hold and retry rule covers
 * every one-time code.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type PendingRegistration,
} from '../entities.ts';
import { isPast, resendAvailableAt, resendCooldownRemaining, toIsoSeconds } from '../policies.ts';
import type { CodeDelivery, IdentityPorts } from '../ports.ts';
import { rateLimitHeaders, type RateLimitOutcome } from '../../ports/session.ts';

/** The `C-004` request. */
export interface ResendRegistrationCodeInput {
  readonly pendingRegistrationId: string;
}

/** The `C-004` answer, or the refusal that stopped it. */
export type ResendRegistrationCodeResult =
  | {
      readonly ok: true;
      readonly pendingRegistrationId: string;
      readonly codeSentAt: string;
      readonly expiresAt: string;
      readonly resendAvailableAt: string;
      readonly codeDelivery: { readonly status: 'sent' | 'delayed'; readonly channel: 'sms' };
    }
  | IdentityFailure;

/**
 * Issues a fresh code for a pending registration.
 *
 * @param caller - The visitor holding the pending registration.
 * @param deps - The pending, code and limiter ports.
 * @param input - The pending registration's identifier.
 */
export async function resendRegistrationCode(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: ResendRegistrationCodeInput,
): Promise<ResendRegistrationCodeResult> {
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'STAFF_SESSION_PRESENT',
      'A staff session cannot resend a resident registration code.',
    );
  }
  if (typeof input.pendingRegistrationId !== 'string' || input.pendingRegistrationId === '') {
    return identityFailure(
      'VALIDATION_FAILED',
      'REGISTRATION_CONFIRMATION_INVALID',
      'The pending registration is missing.',
      { pendingRegistrationId: 'REQUIRED' },
    );
  }

  const now = toIsoSeconds(deps.clock.now());
  let pending: PendingRegistration | null;
  try {
    pending = await deps.pendingRegistrations.findById(input.pendingRegistrationId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The registration could not be read, so no code was sent.',
    );
  }
  if (pending === null || isPast(pending.expiresAt, now)) {
    return identityFailure(
      'NOT_FOUND',
      'PENDING_REGISTRATION_EXPIRED',
      'That registration has expired. Start again to receive a new code.',
      {},
      { meta: { recoveryPath: '/join' } },
    );
  }
  if (pending.verifiedAt !== undefined) {
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'CODE_ALREADY_USED',
      'That registration already has an account. Sign in instead.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }

  const remaining = resendCooldownRemaining(pending.codeSentAt, now);
  if (remaining > 0) {
    return identityFailure(
      'RATE_LIMITED',
      'RESEND_COOLDOWN',
      'A new code was just sent. Wait a moment before asking for another.',
      {},
      { retryAfterSeconds: remaining },
    );
  }

  const limited = await consultLimiter(deps, {
    bucket: 'registration_resend',
    subject: { kind: 'number', value: pending.telephoneNumber },
  });
  if (!limited.ok) {
    return identityFailure(
      'SERVICE_DEGRADED',
      'RATE_LIMIT_UNAVAILABLE',
      'The request could not be checked. Try again in a moment.',
    );
  }
  if (!limited.outcome.allowed) {
    // `C-004` names the wait; `C-001` puts the cap, the remainder and the reset on the refusal too, so
    // the transport prints the headers from this answer rather than from a second consult.
    const headers = rateLimitHeaders(limited.outcome);
    return identityFailure(
      'RATE_LIMITED',
      'REGISTRATION_RATE_LIMITED',
      'Too many codes have been sent to this number. Try again shortly.',
      {},
      {
        retryAfterSeconds: limited.outcome.retryAfterSeconds,
        ...(headers === null ? {} : { rateLimit: headers }),
      },
    );
  }

  // `C-004`, `C-076`: the code leaves through the notification boundary, which owns the queue, the
  // hold and the retry. The dedupe key names the fact and the issue instant, so a replay of this
  // resend sends nothing a second time while a later resend is its own message.
  let delivery: CodeDelivery = { status: 'delayed', channel: 'sms' };
  try {
    delivery = await deps.notifications.deliverCode({
      pendingRegistrationId: pending.id,
      locale: pending.locale,
      dedupeKey: `registration_code:${pending.id}:${now}`,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
  } catch {
    // A boundary that cannot take the call is the same answer as a hold: nothing reached the resident.
    delivery = { status: 'delayed', channel: 'sms' };
  }
  if (delivery.status !== 'sent') {
    // `C-004`, `C-076`: the pending registration survives a refused dispatch, and the answer says so.
    // The resend window does not restart, because the delivery did not happen; asking again is safe.
    return identityFailure(
      'SERVICE_DEGRADED',
      'SMS_CHANNEL_UNAVAILABLE',
      'The message could not be sent. Your registration is still held; try again in a moment.',
      {},
      { meta: { pendingRegistrationPreserved: true } },
    );
  }

  try {
    await deps.pendingRegistrations.recordCodeSent(pending.id, now);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The code was sent but the registration could not be updated. Try again in a moment.',
    );
  }

  return {
    ok: true,
    pendingRegistrationId: pending.id,
    codeSentAt: now,
    expiresAt: pending.expiresAt,
    resendAvailableAt: resendAvailableAt(now),
    codeDelivery: delivery,
  };
}

/** One limiter consult that keeps the whole answer, with a store failure kept apart from a refusal. */
async function consultLimiter(
  deps: Pick<IdentityPorts, 'rateLimits'>,
  input: Parameters<IdentityPorts['rateLimits']['consume']>[0],
): Promise<{ readonly ok: true; readonly outcome: RateLimitOutcome } | { readonly ok: false }> {
  try {
    return { ok: true, outcome: await deps.rateLimits.consume(input) };
  } catch {
    // A limiter that cannot answer must not become an unhandled exception or a silent admission.
    return { ok: false };
  }
}
