/**
 * Accepting a registration code and creating the account (`C-003`, `FEAT-001`, `NFR-020`,
 * `EVT-003`, `EVT-004`).
 *
 * The PendingRegistration is marked verified and the Member is created in `registered` in one unit of
 * work. The account carries the verification method, the declared ward status (unresolved until the
 * ward screen settles it) and the 18-to-35 band the form already checked. The code is consumed, so it
 * cannot create a second account.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type MemberRecord,
  type PendingRegistration,
} from '../entities.ts';
import {
  CODE_COOLDOWN_SECONDS,
  addSeconds,
  codeFailureOutcome,
  deliveryDelayBand,
  isPast,
  memberSessionExpiry,
  readCode,
  registrationProjection,
  secondsUntil,
  toIsoSeconds,
  type RegistrationMemberProjection,
} from '../policies.ts';
import type { CodeAttempts, CodeMatchResult, IdentityPorts } from '../ports.ts';
import { liveSessionCookie, type SessionCookie } from '../../ports/session.ts';
import { appendIdentityAudit, emitIdentityAnalytics } from './support.ts';

/** The `C-003` request. */
export interface ConfirmRegistrationInput {
  readonly pendingRegistrationId: string;
  readonly code: string;
}

/** The `C-003` answer, or the refusal that stopped it. */
export type ConfirmRegistrationResult =
  | {
      readonly ok: true;
      readonly member: RegistrationMemberProjection;
      readonly session: { readonly established: true; readonly expiresAt: string };
      readonly nextScreen: '/join/ward';
      /**
       * The cookie the transport must set (`C-003`, `NFR-026`). It is not part of the response body:
       * the opaque session token reaches the browser in this header and nowhere else.
       */
      readonly cookie?: SessionCookie;
    }
  | IdentityFailure;

/**
 * Confirms one code and creates the account.
 *
 * @param caller - The visitor holding the pending registration; staff may not confirm one.
 * @param deps - The pending, code, member, session, audit and analytics ports.
 * @param input - The pending registration's identifier and the six digits the resident typed.
 */
export async function confirmRegistration(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: ConfirmRegistrationInput,
): Promise<ConfirmRegistrationResult> {
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'STAFF_SESSION_PRESENT',
      'A staff session cannot confirm a resident registration.',
    );
  }

  const fields: Record<string, IdentityFieldReason> = {};
  if (typeof input.pendingRegistrationId !== 'string' || input.pendingRegistrationId === '') {
    fields['pendingRegistrationId'] = 'REQUIRED';
  }
  const code = readCode(input.code);
  if (!code.ok) fields[code.field] = code.reason;
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'REGISTRATION_CONFIRMATION_INVALID',
      'Enter the six digits from the message.',
      fields,
    );
  }
  if (!code.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'REGISTRATION_CONFIRMATION_INVALID',
      'Enter the six digits from the message.',
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
      'The registration could not be read, so nothing was created.',
    );
  }
  if (pending === null || isPast(pending.expiresAt, now)) {
    // `C-003`: an unknown and an expired pending registration answer the same way.
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
      'That code has already created an account. Sign in instead.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }

  let attempts: CodeAttempts;
  try {
    attempts = await deps.codes.readAttempts(pending.id);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CODE_STORE_UNAVAILABLE',
      'The code could not be checked, so nothing was created.',
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

  let comparison: CodeMatchResult;
  try {
    comparison = await deps.codes.matches(pending.id, code.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CODE_STORE_UNAVAILABLE',
      'The code could not be checked, so nothing was created.',
    );
  }

  if (comparison === 'absent') {
    // `C-003`: the pending registration is still live, since an expired one was refused above, so a code
    // that is no longer stored closed its window. Nothing is counted as an attempt — an expiry is not a
    // wrong guess — and the answer carries the resend the screen's Expired state leads with.
    return identityFailure(
      'VALIDATION_FAILED',
      'CODE_EXPIRED',
      'That code has expired. Request a new one.',
      {},
      { meta: { recoveryPath: '/join/confirm' } },
    );
  }

  if (comparison === 'mismatch') {
    let failures: number;
    try {
      failures = await deps.codes.recordFailure(pending.id, now);
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'CODE_STORE_UNAVAILABLE',
        'The code could not be checked, so nothing was created.',
      );
    }
    const outcome = codeFailureOutcome(failures);
    if (outcome.cooldown) {
      try {
        await deps.codes.startCooldown(pending.id, addSeconds(now, CODE_COOLDOWN_SECONDS));
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
          meta: { recoveryPath: '/join/confirm' },
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

  // `FEAT-001`: a number shared by two people keeps two accounts, each marked as sharing it.
  let existing: readonly MemberRecord[];
  try {
    existing = await deps.members.findByTelephone(pending.telephoneNumber);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The account store could not be read, so nothing was created.',
    );
  }

  const memberId = deps.identifiers.next('mbr');
  const member: MemberRecord = {
    id: memberId,
    telephoneNumber: pending.telephoneNumber,
    fullName: pending.fullName,
    displayName: pending.displayName,
    declaredAge: pending.declaredAge,
    wardStatus: 'unresolved',
    identityState: 'registered',
    verificationMethod: 'self_code',
    sharedNumber: existing.length > 0,
    locale: pending.locale,
    createdAt: now,
  };

  try {
    await deps.codes.consume(pending.id);
    await deps.pendingRegistrations.markVerified(pending.id, now);
    await deps.members.create(member);
    if (existing.length > 0) {
      await deps.members.markSharedNumber(pending.telephoneNumber);
    }
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The account could not be created. Try again in a moment.',
    );
  }

  const expiresAt = memberSessionExpiry(now);
  let sessionId: string;
  try {
    ({ sessionId } = await deps.memberSessions.create({
      memberId,
      at: now,
      expiresAt,
      absoluteExpiresAt: expiresAt,
    }));
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The account was created but the session could not be opened. Sign in to continue.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }

  // The window is the one the adapter reported, not the one asked for: the adapter may shorten an
  // idle window, and a cookie must never outlive the session behind it (`NFR-026`).
  const cookie = liveSessionCookie({
    namespace: 'member',
    token: sessionId,
    expiresAt,
    absoluteExpiresAt: expiresAt,
    now,
  });

  const refused = await appendIdentityAudit(deps, {
    actorId: memberId,
    actorRole: 'member',
    action: 'member.registered',
    entityType: 'Member',
    entityId: memberId,
    reason: 'SELF_CODE',
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  await emitIdentityAnalytics(deps, [
    {
      name: 'number_confirmed',
      properties: {
        attempts: attempts.attempts + 1,
        delivery_delay_band: deliveryDelayBand(pending.codeSentAt, now),
      },
      // `EVT-003`, `C-089`: the code was accepted for this member, and the account exists by the time
      // the event is dispatched, so the subject is the member rather than the pending registration.
      subject: { kind: 'member', memberId },
      locale: member.locale,
    },
    {
      name: 'account_registered',
      properties: {
        identity_state: 'registered',
        verification_method: 'self_code',
        shared_number: member.sharedNumber,
        ward_resolved: false,
        locale: member.locale,
      },
      subject: { kind: 'member', memberId },
      locale: member.locale,
    },
  ]);

  return {
    ok: true,
    member: registrationProjection(member),
    session: { established: true, expiresAt },
    nextScreen: '/join/ward',
    ...(cookie === null ? {} : { cookie }),
  };
}
