/**
 * Satisfying a staff second factor (`C-092`, `NFR-020`, `NFR-028`).
 *
 * Accepts one time-based code or one unused recovery code, and replaces the challenge with the staff
 * session: thirty minutes idle, eight hours absolute from the password step. Until this succeeds the
 * session reaches the factor screens and nothing else.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type StaffCredentialState,
  type StaffUser,
} from '../entities.ts';
import {
  STAFF_LOCK_ATTEMPT_LIMIT,
  STAFF_LOCK_SECONDS,
  STAFF_LOCK_WINDOW_SECONDS,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW_STEPS,
  isPast,
  isSecondFactorEnrolled,
  readCode,
  readIdempotencyKey,
  secondsUntil,
  staffLockState,
  staffProjection,
  staffSessionWindow,
  toIsoSeconds,
  type StaffProjection,
} from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import {
  appendIdentityAudit,
  fingerprintOf,
  isRecord,
  lookupReplay,
  recordAnswer,
  refuseStaffSignIn,
  reusedKeyFailure,
} from './support.ts';

/** The `C-092` second-factor request. Exactly one of `code` and `recoveryCode` is present. */
export interface VerifyStaffSecondFactorInput {
  readonly code?: string;
  readonly recoveryCode?: string;
  readonly idempotencyKey?: string;
}

/** The `C-092` satisfied answer. */
export interface StaffSignedIn {
  readonly ok: true;
  readonly staff: StaffProjection & { readonly secondFactorEnrolled: true };
  readonly session: { readonly expiresAt: string; readonly absoluteExpiresAt: string };
  readonly nextScreen: '/admin';
}

/** The `C-092` answer, or the refusal that stopped it. */
export type VerifyStaffSecondFactorResult = StaffSignedIn | IdentityFailure;

/** Narrows a recorded answer back to this operation's shape. */
function isSignedIn(value: unknown): value is StaffSignedIn {
  return isRecord(value) && value['ok'] === true && isRecord(value['staff']);
}

/**
 * Verifies one second factor against the challenge session.
 *
 * @param caller - The staff challenge session from the password step.
 * @param deps - The credential, staff, session, idempotency and audit ports.
 * @param input - A six-digit code or a recovery code, and the idempotency key.
 */
export async function verifyStaffSecondFactor(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: VerifyStaffSecondFactorInput,
): Promise<VerifyStaffSecondFactorResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'Enter your username and password first.',
      {},
      { meta: { recoveryPath: '/admin/sign-in' } },
    );
  }
  if (caller.kind === 'member') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_PRESENT',
      'A resident session cannot reach the staff console.',
    );
  }

  const fields: Record<string, IdentityFieldReason> = {};
  const key = readIdempotencyKey(input.idempotencyKey);
  if (!key.ok) fields[key.field] = key.reason;
  const hasCode = input.code !== undefined && input.code !== null && input.code !== '';
  const hasRecovery =
    input.recoveryCode !== undefined && input.recoveryCode !== null && input.recoveryCode !== '';
  if (hasCode && hasRecovery) {
    fields['recoveryCode'] = 'ALREADY_SET';
  }
  let code: string | null = null;
  if (hasCode) {
    const reading = readCode(input.code);
    if (!reading.ok) fields[reading.field] = reading.reason;
    else code = reading.value;
  }
  if (!hasCode && !hasRecovery) {
    fields['code'] = 'REQUIRED';
  }
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'SECOND_FACTOR_INVALID',
      'Enter the six digits from your authenticator, or a recovery code.',
      fields,
    );
  }
  if (!key.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'SECOND_FACTOR_INVALID',
      'The request could not be read.',
    );
  }

  // The code is a secret, so it never enters the replay fingerprint; a replay returns the first answer.
  const fingerprint = fingerprintOf([caller.staffId, hasRecovery ? 'recovery' : 'totp']);
  const replay = await lookupReplay(deps, key.value, fingerprint, isSignedIn);
  if (replay.kind === 'mismatch') return reusedKeyFailure();
  if (replay.kind === 'replay') return replay.result;

  const now = toIsoSeconds(deps.clock.now());
  if (isPast(caller.sessionExpiresAt, now)) {
    return identityFailure(
      'UNAUTHENTICATED',
      'SECOND_FACTOR_CHALLENGE_EXPIRED',
      'That sign-in timed out. Enter your password again.',
      {},
      { meta: { recoveryPath: '/admin/sign-in' } },
    );
  }

  let credential: StaffCredentialState | null;
  try {
    credential = await deps.credentials.findByStaffUserId(caller.staffId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The sign-in could not be checked. Try again in a moment.',
    );
  }
  if (credential === null) {
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'That staff account is no longer available.',
      {},
      { meta: { recoveryPath: '/admin/sign-in' } },
    );
  }

  let staff: StaffUser | null;
  try {
    staff = await deps.staffUsers.get(caller.staffId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The sign-in could not be checked. Try again in a moment.',
    );
  }
  if (staff === null || !staff.active) {
    await refuseStaffSignIn(deps, {
      staffId: caller.staffId,
      role: caller.role,
      reason: 'STAFF_INACTIVE',
      occurredAt: now,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
    return identityFailure(
      'FORBIDDEN_ROLE',
      'STAFF_INACTIVE',
      'This staff account is not active. Ask the operator to restore access.',
    );
  }

  const lock = staffLockState(credential, now);
  if (lock.locked) {
    await refuseStaffSignIn(deps, {
      staffId: staff.id,
      role: staff.role,
      reason: 'ACCOUNT_LOCKED',
      occurredAt: now,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
    return identityFailure(
      'RATE_LIMITED',
      'ACCOUNT_LOCKED',
      'This account is paused after repeated failures. Try again later.',
      {},
      { retryAfterSeconds: lock.retryAfterSeconds },
    );
  }
  if (!isSecondFactorEnrolled(credential)) {
    return identityFailure(
      'POLICY_VIOLATION',
      'SECOND_FACTOR_NOT_ENROLLED',
      'Set up your authenticator before signing in.',
      {},
      { meta: { recoveryPath: '/admin/enrol' } },
    );
  }

  let verified = false;
  let refusal: IdentityFailure | null = null;
  let failureReason = 'SECOND_FACTOR_INCORRECT';
  let spentRecoveryCode = false;

  if (code !== null) {
    try {
      verified = await deps.credentials.verifyTotp(credential.id, {
        code,
        at: now,
        digits: TOTP_DIGITS,
        periodSeconds: TOTP_PERIOD_SECONDS,
        windowSteps: TOTP_WINDOW_STEPS,
      });
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'CREDENTIAL_STORE_UNAVAILABLE',
        'The code could not be checked. Try again in a moment.',
      );
    }
    if (!verified) refusal = incorrectFactor();
  } else {
    const recovery = input.recoveryCode ?? '';
    let match: { readonly index: number; readonly spent: boolean } | null;
    try {
      match = await deps.credentials.verifyRecoveryCode(credential.id, recovery);
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'CREDENTIAL_STORE_UNAVAILABLE',
        'The code could not be checked. Try again in a moment.',
      );
    }
    if (match === null) {
      refusal = identityFailure(
        'UNAUTHENTICATED',
        'RECOVERY_CODE_UNKNOWN',
        'That recovery code is not one of the codes issued for this account.',
      );
      failureReason = 'RECOVERY_CODE_UNKNOWN';
    } else if (match.spent) {
      refusal = identityFailure(
        'UNAUTHENTICATED',
        'RECOVERY_CODE_SPENT',
        'That recovery code has already been used.',
      );
      failureReason = 'RECOVERY_CODE_SPENT';
    } else {
      let spent: boolean;
      try {
        spent = await deps.credentials.spendRecoveryCode(credential.id, match.index, now);
      } catch {
        return identityFailure(
          'SERVICE_DEGRADED',
          'CREDENTIAL_STORE_UNAVAILABLE',
          'The code could not be checked. Try again in a moment.',
        );
      }
      if (spent) {
        verified = true;
        spentRecoveryCode = true;
      } else {
        refusal = identityFailure(
          'UNAUTHENTICATED',
          'RECOVERY_CODE_SPENT',
          'That recovery code has already been used.',
        );
        failureReason = 'RECOVERY_CODE_SPENT';
      }
    }
  }

  if (!verified) {
    const failure = await recordFactorFailure(deps, credential.id, now);
    await refuseStaffSignIn(deps, {
      staffId: staff.id,
      role: staff.role,
      reason: failureReason,
      occurredAt: now,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
    if (failure?.lockedUntil !== undefined && !isPast(failure.lockedUntil, now)) {
      return identityFailure(
        'RATE_LIMITED',
        'ACCOUNT_LOCKED',
        'Too many failed attempts. This account is paused for thirty minutes.',
        {},
        { retryAfterSeconds: secondsUntil(failure.lockedUntil, now) },
      );
    }
    return refusal ?? incorrectFactor();
  }

  try {
    await deps.credentials.clearFailures(credential.id, now);
    await deps.credentials.recordSignIn(credential.id, now);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The sign-in could not be completed. Try again in a moment.',
    );
  }

  const window = staffSessionWindow(caller.sessionStartedAt, now);
  try {
    await deps.staffSessions.upgrade(caller.sessionId, {
      secondFactorSatisfied: true,
      at: now,
      expiresAt: window.expiresAt,
      absoluteExpiresAt: window.absoluteExpiresAt,
    });
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The session could not be opened. Try again in a moment.',
    );
  }

  const signedIn = await appendIdentityAudit(deps, {
    actorId: staff.id,
    actorRole: staff.role,
    action: 'staff.signed_in',
    entityType: 'StaffUser',
    entityId: staff.id,
    reason: spentRecoveryCode ? 'RECOVERY_CODE' : 'SECOND_FACTOR',
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (signedIn !== null) return signedIn;

  if (spentRecoveryCode) {
    const recorded = await appendIdentityAudit(deps, {
      actorId: staff.id,
      actorRole: staff.role,
      action: 'staff.recovery_code_used',
      entityType: 'StaffUser',
      entityId: staff.id,
      occurredAt: now,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
    if (recorded !== null) return recorded;
  }

  const result: StaffSignedIn = {
    ok: true,
    staff: {
      ...staffProjection(staff, { secondFactorSatisfied: true, includeEnrolment: true }),
      secondFactorEnrolled: true,
    },
    session: { expiresAt: window.expiresAt, absoluteExpiresAt: window.absoluteExpiresAt },
    nextScreen: '/admin',
  };
  await recordAnswer(deps, key.value, fingerprint, result);
  return result;
}

/** The one refusal a wrong time-based code produces. */
function incorrectFactor(): IdentityFailure {
  return identityFailure(
    'UNAUTHENTICATED',
    'SECOND_FACTOR_INCORRECT',
    'That code is not right. Check your authenticator and try again.',
  );
}

/**
 * Records one failed factor and applies the lock rule.
 *
 * @returns The new state, or `null` when the credential store refused; the caller then answers its own
 *   refusal, because a failure the store could not count must not be reported as a counted one.
 */
async function recordFactorFailure(
  deps: IdentityPorts,
  credentialId: string,
  at: string,
): Promise<{ readonly failedAttemptCount: number; readonly lockedUntil?: string } | null> {
  try {
    return await deps.credentials.recordFailure(credentialId, {
      at,
      lockAttemptLimit: STAFF_LOCK_ATTEMPT_LIMIT,
      lockWindowSeconds: STAFF_LOCK_WINDOW_SECONDS,
      lockSeconds: STAFF_LOCK_SECONDS,
    });
  } catch {
    return null;
  }
}
