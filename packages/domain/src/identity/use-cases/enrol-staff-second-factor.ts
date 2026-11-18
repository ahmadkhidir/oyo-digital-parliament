/**
 * Enrolling a staff second factor (`C-092`, `NFR-020`, `NFR-021`).
 *
 * One enrolment per credential: the secret is shown once, the first code proves the authenticator, and
 * ten single-use recovery codes are issued in that same answer and never again. Confirming the code
 * completes the sign-in, so the session that was waiting on its factor reaches the console.
 *
 * The recovery codes are deliberately not replayed through the idempotency store: recording them would
 * keep a second plaintext copy of secrets that `schema.md` holds only as hashes. A repeated confirmation
 * therefore answers `SECOND_FACTOR_ALREADY_ENROLLED` and sends the member to the console.
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
  RECOVERY_CODE_COUNT,
  STAFF_LOCK_ATTEMPT_LIMIT,
  STAFF_LOCK_SECONDS,
  STAFF_LOCK_WINDOW_SECONDS,
  TOTP_DIGITS,
  TOTP_ISSUER,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW_STEPS,
  isPast,
  isSecondFactorEnrolled,
  readCode,
  readEnrolmentAction,
  readIdempotencyKey,
  secondsUntil,
  staffLockState,
  staffSessionWindow,
  toIsoSeconds,
} from '../policies.ts';
import type { IdentityPorts, TotpEnrolment } from '../ports.ts';
import { liveSessionCookie, type SessionCookie } from '../../ports/session.ts';
import { appendIdentityAudit, refuseStaffSignIn } from './support.ts';

/** The `C-092` enrolment request: `begin` issues the secret, `confirm` proves it. */
export interface EnrolStaffSecondFactorInput {
  readonly action: 'begin' | 'confirm';
  readonly code?: string;
  readonly idempotencyKey?: string;
}

/** The `begin` answer: the secret, shown once. */
export interface EnrolmentBegun {
  readonly ok: true;
  readonly action: 'begin';
  readonly totp: TotpEnrolment;
}

/** The `confirm` answer: the recovery codes, shown once. */
export interface EnrolmentComplete {
  readonly ok: true;
  readonly action: 'confirm';
  readonly secondFactorEnrolled: true;
  readonly secondFactorEnrolledAt: string;
  readonly recoveryCodes: readonly string[];
  readonly nextScreen: '/admin';
  /**
   * The staff cookie, re-presented with the satisfied session's window (`C-092`, `NFR-026`). Enrolment
   * completes the sign-in, so the ten-minute challenge cookie must be replaced by the session's.
   */
  readonly cookie?: SessionCookie;
}

/** The `C-092` answer, or the refusal that stopped it. */
export type EnrolStaffSecondFactorResult = EnrolmentBegun | EnrolmentComplete | IdentityFailure;

/**
 * Begins or completes one second-factor enrolment.
 *
 * @param caller - The staff challenge session that still owes its factor.
 * @param deps - The credential, staff, session and audit ports.
 * @param input - The action, the proving code and the idempotency key.
 */
export async function enrolStaffSecondFactor(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: EnrolStaffSecondFactorInput,
): Promise<EnrolStaffSecondFactorResult> {
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

  const action = readEnrolmentAction(input.action);
  const key = readIdempotencyKey(input.idempotencyKey);
  const fields: Record<string, IdentityFieldReason> = {};
  if (!action.ok) fields[action.field] = action.reason;
  if (!key.ok) fields[key.field] = key.reason;
  let code: string | null = null;
  if (input.action === 'confirm') {
    const reading = readCode(input.code);
    if (!reading.ok) fields[reading.field] = reading.reason;
    else code = reading.value;
  }
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'SECOND_FACTOR_ENROLMENT_INVALID',
      'The enrolment request could not be read.',
      fields,
    );
  }
  if (!action.ok || !key.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'SECOND_FACTOR_ENROLMENT_INVALID',
      'The enrolment request could not be read.',
    );
  }

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
      'The enrolment could not be checked. Try again in a moment.',
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
      'The enrolment could not be checked. Try again in a moment.',
    );
  }
  if (staff === null || !staff.active) {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'STAFF_INACTIVE',
      'This staff account is not active. Ask the operator to restore access.',
    );
  }

  const lock = staffLockState(credential, now);
  if (lock.locked) {
    return identityFailure(
      'RATE_LIMITED',
      'ACCOUNT_LOCKED',
      'This account is paused after repeated failures. Try again later.',
      {},
      { retryAfterSeconds: lock.retryAfterSeconds },
    );
  }

  if (isSecondFactorEnrolled(credential)) {
    return identityFailure(
      'POLICY_VIOLATION',
      'SECOND_FACTOR_ALREADY_ENROLLED',
      'This account already has a second factor. Ask the operator if it was lost.',
      {},
      { meta: { recoveryPath: '/admin' } },
    );
  }

  if (action.value === 'begin') {
    let enrolment: TotpEnrolment;
    try {
      enrolment = await deps.credentials.beginTotpEnrolment(credential.id, {
        username: credential.username,
        issuer: TOTP_ISSUER,
        algorithm: 'SHA1',
        digits: TOTP_DIGITS,
        periodSeconds: TOTP_PERIOD_SECONDS,
      });
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'CREDENTIAL_STORE_UNAVAILABLE',
        'The authenticator setup could not be prepared. Try again in a moment.',
      );
    }
    // No audit entry: the secret is a credential in progress, not a state change on the record.
    return { ok: true, action: 'begin', totp: enrolment };
  }

  if (code === null) {
    return identityFailure(
      'VALIDATION_FAILED',
      'SECOND_FACTOR_ENROLMENT_INVALID',
      'Enter the six digits from your authenticator.',
      { code: 'REQUIRED' },
    );
  }

  let completed:
    | {
        readonly verified: true;
        readonly enrolledAt: string;
        readonly recoveryCodes: readonly string[];
      }
    | { readonly verified: false };
  try {
    completed = await deps.credentials.completeTotpEnrolment(credential.id, {
      code,
      at: now,
      digits: TOTP_DIGITS,
      periodSeconds: TOTP_PERIOD_SECONDS,
      windowSteps: TOTP_WINDOW_STEPS,
      recoveryCodeCount: RECOVERY_CODE_COUNT,
    });
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The code could not be checked. Try again in a moment.',
    );
  }

  if (!completed.verified) {
    let failure: { readonly failedAttemptCount: number; readonly lockedUntil?: string } | null =
      null;
    try {
      failure = await deps.credentials.recordFailure(credential.id, {
        at: now,
        lockAttemptLimit: STAFF_LOCK_ATTEMPT_LIMIT,
        lockWindowSeconds: STAFF_LOCK_WINDOW_SECONDS,
        lockSeconds: STAFF_LOCK_SECONDS,
      });
    } catch {
      failure = null;
    }
    await refuseStaffSignIn(deps, {
      staffId: staff.id,
      role: staff.role,
      reason: 'SECOND_FACTOR_INCORRECT',
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
    return identityFailure(
      'UNAUTHENTICATED',
      'SECOND_FACTOR_INCORRECT',
      'That code is not right. Check your authenticator and try again.',
    );
  }

  const enrolledAt = completed.enrolledAt;
  const window = staffSessionWindow(caller.sessionStartedAt, now);
  try {
    await deps.staffUsers.setSecondFactorEnrolled(staff.id, true, now);
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
      'The enrolment could not be completed. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: staff.id,
    actorRole: staff.role,
    action: 'staff.second_factor_enrolled',
    entityType: 'StaffUser',
    entityId: staff.id,
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  const cookie = liveSessionCookie({
    namespace: 'staff',
    token: caller.sessionId,
    expiresAt: window.expiresAt,
    absoluteExpiresAt: window.absoluteExpiresAt,
    now,
  });
  return {
    ok: true,
    action: 'confirm',
    secondFactorEnrolled: true,
    secondFactorEnrolledAt: enrolledAt,
    recoveryCodes: completed.recoveryCodes,
    nextScreen: '/admin',
    ...(cookie === null ? {} : { cookie }),
  };
}
