/**
 * Requesting a sign-in code (`C-005`, `FEAT-001`, `NFR-020`, `NFR-027`, `EVT-002`).
 *
 * Starts a challenge for a number that belongs to at least one account. It reveals only how many
 * accounts share the number, never a name, until a code is accepted: a shared handset must not leak
 * who else uses it.
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
import { consumeRateLimit, emitIdentityAnalytics } from './support.ts';

/** The `C-005` request. */
export interface RequestSignInCodeInput {
  readonly telephoneNumber: string;
}

/** The `C-005` answer, or the refusal that stopped it. */
export type RequestSignInCodeResult =
  | {
      readonly ok: true;
      readonly signInChallengeId: string;
      readonly accountCount: number;
      readonly accountChoiceRequired: boolean;
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

  const limited = await consumeRateLimit(deps, {
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
  if (!limited.allowed) {
    return identityFailure(
      'RATE_LIMITED',
      'SIGN_IN_RATE_LIMITED',
      'Too many sign-in attempts from this number. Try again shortly.',
      {},
      { retryAfterSeconds: limited.retryAfterSeconds },
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
  if (accounts.length === 0) {
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
      memberIds: accounts.map((account) => account.id),
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
      locale: accounts[0]?.locale ?? 'en-NG',
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

  await emitIdentityAnalytics(deps, [{ name: 'sign_in_started', properties: { attempt } }]);

  return {
    ok: true,
    signInChallengeId: challengeId,
    accountCount: accounts.length,
    accountChoiceRequired: accounts.length > 1,
    codeDelivery: {
      status: 'sent',
      channel: 'sms',
      resendAvailableAt: resendAvailableAt(now),
    },
    expiresAt,
  };
}
