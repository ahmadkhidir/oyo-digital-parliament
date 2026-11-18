/**
 * Verifying a sign-in code and opening a session (`C-006`, `FEAT-001`, `NFR-020`, `NFR-026`).
 *
 * Resolves which account is signing in. A number shared by two people never signs in automatically:
 * the caller must name the account once the code is accepted, and the accounts are never merged.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type MemberRecord,
  type SignInChallenge,
} from '../entities.ts';
import {
  CODE_COOLDOWN_SECONDS,
  addSeconds,
  codeFailureOutcome,
  isPast,
  memberSessionExpiry,
  readCode,
  readReturnTo,
  secondsUntil,
  sessionMemberProjection,
  toIsoSeconds,
  type SessionMemberProjection,
} from '../policies.ts';
import type { CodeAttempts, IdentityPorts } from '../ports.ts';
import { appendIdentityAudit } from './support.ts';

/** The `C-006` request. `memberId` is required when the number has more than one account. */
export interface CompleteSignInInput {
  readonly signInChallengeId: string;
  readonly code: string;
  readonly memberId?: string;
  /** The internal path the member came from, returned unchanged. */
  readonly returnTo?: string;
}

/** The `C-006` answer, or the refusal that stopped it. */
export type CompleteSignInResult =
  | {
      readonly ok: true;
      readonly member: SessionMemberProjection;
      readonly session: { readonly established: true; readonly expiresAt: string };
      readonly returnTo: string;
    }
  | IdentityFailure;

/**
 * Verifies one code against an open challenge and opens a session.
 *
 * @param caller - The visitor on the sign-in screen.
 * @param deps - The challenge, code, member, session and audit ports.
 * @param input - The challenge, the six digits, the chosen account and the path to return to.
 */
export async function completeSignIn(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: CompleteSignInInput,
): Promise<CompleteSignInResult> {
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'STAFF_SESSION_PRESENT',
      'Staff use the staff sign-in, not a resident sign-in code.',
      {},
      { meta: { recoveryPath: '/admin/sign-in' } },
    );
  }

  const fields: Record<string, IdentityFieldReason> = {};
  if (typeof input.signInChallengeId !== 'string' || input.signInChallengeId === '') {
    fields['signInChallengeId'] = 'REQUIRED';
  }
  const code = readCode(input.code);
  if (!code.ok) fields[code.field] = code.reason;
  const returnTo = readReturnTo(input.returnTo);
  if (!returnTo.ok) fields[returnTo.field] = returnTo.reason;
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'SIGN_IN_INVALID',
      'Enter the six digits from the message.',
      fields,
    );
  }
  if (!code.ok || !returnTo.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'SIGN_IN_INVALID',
      'Enter the six digits from the message.',
    );
  }

  const now = toIsoSeconds(deps.clock.now());
  let challenge: SignInChallenge | null;
  try {
    challenge = await deps.signInChallenges.findById(input.signInChallengeId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The sign-in could not be checked. Try again in a moment.',
    );
  }
  if (challenge === null || isPast(challenge.expiresAt, now)) {
    return identityFailure(
      'NOT_FOUND',
      'SIGN_IN_CHALLENGE_EXPIRED',
      'That code has expired. Request a new one.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (challenge.consumedAt !== undefined) {
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'CODE_ALREADY_USED',
      'That code has already been used. Request a new one.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (challenge.memberIds.length > 1 && (input.memberId === undefined || input.memberId === '')) {
    // `C-006`: a shared number always requires an explicit choice.
    return identityFailure(
      'VALIDATION_FAILED',
      'ACCOUNT_CHOICE_REQUIRED',
      'Choose which account is signing in.',
      { memberId: 'REQUIRED' },
    );
  }

  let attempts: CodeAttempts;
  try {
    attempts = await deps.codes.readAttempts(challenge.id);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CODE_STORE_UNAVAILABLE',
      'The code could not be checked, so no session was opened.',
    );
  }
  if (attempts.cooldownUntil !== undefined && !isPast(attempts.cooldownUntil, now)) {
    return identityFailure(
      'RATE_LIMITED',
      'CODE_ATTEMPTS_EXCEEDED',
      'Too many wrong codes. Wait a moment before trying again.',
      {},
      { retryAfterSeconds: secondsUntil(attempts.cooldownUntil, now), attemptsRemaining: 0 },
    );
  }

  const chosenId =
    input.memberId === undefined || input.memberId === '' ? challenge.memberIds[0] : input.memberId;
  if (chosenId === undefined || !challenge.memberIds.includes(chosenId)) {
    return identityFailure(
      'NOT_FOUND',
      'ACCOUNT_NOT_ON_CHALLENGE',
      'That account cannot sign in with this code.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }

  let matches: boolean;
  try {
    matches = await deps.codes.matches(challenge.id, code.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CODE_STORE_UNAVAILABLE',
      'The code could not be checked, so no session was opened.',
    );
  }

  if (!matches) {
    let failures: number;
    try {
      failures = await deps.codes.recordFailure(challenge.id, now);
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'CODE_STORE_UNAVAILABLE',
        'The code could not be checked, so no session was opened.',
      );
    }
    const outcome = codeFailureOutcome(failures);
    if (outcome.cooldown) {
      try {
        await deps.codes.startCooldown(challenge.id, addSeconds(now, CODE_COOLDOWN_SECONDS));
      } catch {
        // The answer is already the cooldown; a store that cannot record it must not escape.
      }
      return identityFailure(
        'RATE_LIMITED',
        'CODE_ATTEMPTS_EXCEEDED',
        'That code is not right, and the attempts are used up. Request a new code.',
        {},
        {
          retryAfterSeconds: CODE_COOLDOWN_SECONDS,
          attemptsRemaining: 0,
          meta: { recoveryPath: '/sign-in' },
        },
      );
    }
    return identityFailure(
      'VALIDATION_FAILED',
      'CODE_INCORRECT',
      'That code is not right. Check the message and try again.',
      { code: 'PATTERN_MISMATCH' },
      { attemptsRemaining: outcome.attemptsRemaining },
    );
  }

  let member: MemberRecord | null;
  try {
    member = await deps.members.get(chosenId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The account could not be read, so no session was opened.',
    );
  }
  if (member === null || member.deletedAt !== undefined) {
    return identityFailure(
      'NOT_FOUND',
      'MEMBER_NOT_FOUND',
      'That account is no longer available.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }

  let consumed: boolean;
  try {
    consumed = await deps.signInChallenges.consume(challenge.id, now);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The sign-in could not be completed. Try again in a moment.',
    );
  }
  if (!consumed) {
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'CODE_ALREADY_USED',
      'That code has already been used. Request a new one.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }

  const expiresAt = memberSessionExpiry(now);
  try {
    await deps.memberSessions.create({
      memberId: member.id,
      at: now,
      expiresAt,
      absoluteExpiresAt: expiresAt,
    });
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The session could not be opened. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: member.id,
    actorRole: 'member',
    action: 'member.signed_in',
    entityType: 'Member',
    entityId: member.id,
    reason: 'SIGN_IN_CODE',
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  return {
    ok: true,
    member: sessionMemberProjection(member),
    session: { established: true, expiresAt },
    returnTo: returnTo.value,
  };
}
