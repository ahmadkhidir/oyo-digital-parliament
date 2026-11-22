/**
 * Requesting a sign-in code (`C-005`, `FEAT-001`, `NFR-020`, `NFR-027`, `EVT-002`).
 *
 * Starts a challenge for a number that belongs to a Member. A number belongs to at most one account
 * (`FEAT-001`), so the answer names no account count and no account list: the challenge already
 * resolves the one account the code will open a session for.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type MemberRecord,
} from '../entities.ts';
import {
  readTelephone,
  resendAvailableAt,
  signInChallengeExpiry,
  toIsoSeconds,
} from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import { rateLimitHeaders, type RateLimitOutcome } from '../../ports/session.ts';
import { emitIdentityAnalytics } from './support.ts';

/** The `C-005` request. */
export interface RequestSignInCodeInput {
  readonly telephoneNumber: string;
}

/** The `C-005` answer, or the refusal that stopped it. */
export type RequestSignInCodeResult =
  | {
      readonly ok: true;
      readonly signInChallengeId: string;
      readonly codeDelivery: {
        readonly status: 'sent' | 'delayed';
        readonly channel: 'sms';
        readonly resendAvailableAt: string;
      };
      readonly expiresAt: string;
    }
  | IdentityFailure;

/**
 * Opens one sign-in challenge.
 *
 * @param caller - The visitor on the sign-in screen.
 * @param deps - The member, challenge, code, limiter and analytics ports.
 * @param input - The number the resident is signing in with.
 */
export async function requestSignInCode(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: RequestSignInCodeInput,
): Promise<RequestSignInCodeResult> {
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'STAFF_SESSION_PRESENT',
      'Staff use the staff sign-in, not a resident sign-in code.',
      {},
      { meta: { recoveryPath: '/admin/sign-in' } },
    );
  }

  const telephoneNumber = readTelephone(input.telephoneNumber);
  if (!telephoneNumber.ok) {
    const fields: Record<string, IdentityFieldReason> = {
      [telephoneNumber.field]: telephoneNumber.reason,
    };
    return identityFailure(
      'VALIDATION_FAILED',
      'SIGN_IN_INVALID',
      'Enter the telephone number the account was registered with.',
      fields,
    );
  }

  const limited = await consultLimiter(deps, {
    bucket: 'sign_in',
    subject: { kind: 'number', value: telephoneNumber.value },
  });
  if (!limited.ok) {
    return identityFailure(
      'SERVICE_DEGRADED',
      'RATE_LIMIT_UNAVAILABLE',
      'The request could not be checked. Try again in a moment.',
    );
  }
  if (!limited.outcome.allowed) {
    // `C-005` names the wait; `C-001` puts the cap, the remainder and the reset on the refusal as well,
    // so the transport prints the headers from this answer instead of consulting the limiter again.
    const headers = rateLimitHeaders(limited.outcome);
    return identityFailure(
      'RATE_LIMITED',
      'SIGN_IN_RATE_LIMITED',
      'Too many sign-in attempts from this number. Try again shortly.',
      {},
      {
        retryAfterSeconds: limited.outcome.retryAfterSeconds,
        ...(headers === null ? {} : { rateLimit: headers }),
      },
    );
  }

  let accounts: readonly MemberRecord[];
  try {
    accounts = await deps.members.findByTelephone(telephoneNumber.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The account store could not be read, so no code was sent.',
    );
  }
  const account = accounts[0];
  if (account === undefined) {
    return identityFailure(
      'NOT_FOUND',
      'NO_ACCOUNT_FOR_NUMBER',
      'No account uses that number yet. Create one to take part.',
      {},
      { meta: { recoveryPath: '/join' } },
    );
  }

  const now = toIsoSeconds(deps.clock.now());
  const challengeId = deps.identifiers.next('sic');
  const expiresAt = signInChallengeExpiry(now);

  let attempt: number;
  try {
    const created = await deps.signInChallenges.create({
      id: challengeId,
      telephoneNumber: telephoneNumber.value,
      // `FEAT-001`: the number resolves to one account, so the challenge carries exactly that one.
      memberIds: [account.id],
      at: now,
      expiresAt,
    });
    attempt = created.attempt;
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The sign-in could not be started. Try again in a moment.',
    );
  }

  try {
    await deps.codes.issue({
      targetId: challengeId,
      telephoneNumber: telephoneNumber.value,
      locale: account.locale,
      at: now,
    });
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SMS_CHANNEL_UNAVAILABLE',
      'The message could not be sent. Try again in a moment.',
      {},
      { retryAfterSeconds: 30 },
    );
  }

  await emitIdentityAnalytics(deps, [
    {
      name: 'sign_in_started',
      properties: { attempt },
      // `EVT-002`, `C-089`: the number resolves to the one account it belongs to, so that account is
      // the subject of the attempt.
      subject: { kind: 'member', memberId: account.id },
      locale: account.locale,
    },
  ]);

  return {
    ok: true,
    signInChallengeId: challengeId,
    codeDelivery: {
      status: 'sent',
      channel: 'sms',
      resendAvailableAt: resendAvailableAt(now),
    },
    expiresAt,
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
    // `NFR-027` puts the limiter in front of every sign-in; one that cannot answer neither admits the
    // call nor becomes an unhandled exception, and the caller answers `SERVICE_DEGRADED`.
    return { ok: false };
  }
}
