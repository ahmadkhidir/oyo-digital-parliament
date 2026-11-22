/**
 * Resetting another staff member's credential (`C-093`, `NFR-020`, `NFR-021`, `NFR-026`, `NFR-028`,
 * `operations.md` Lockout and recovery, screen 26).
 *
 * A staff member who has lost both factors asks the operator. The operator opens the credentials
 * panel on Admin Home, chooses the staff member, hands over a replacement password in person and
 * records why. The write replaces the password hash, clears the enrolled second factor and its
 * recovery codes, clears the failure count and the lock, and ends every session the target holds, so
 * the target must enrol a fresh factor before returning to work.
 *
 * Four rules shape the module:
 *
 * - **Nothing about the credential is returned.** The answer prints the staff account and the
 *   credential's state — when the password changed, that no factor is enrolled, that no lock is in
 *   force — and no part of the password, the TOTP secret or a recovery code (`C-093`).
 * - **A reset of one's own account needs a second operator.** There is no self-service recovery path;
 *   the refusal is `POLICY_VIOLATION` with a stable cause, and it is audited like every other attempt.
 * - **A replay writes once.** The same `Idempotency-Key` returns the recorded answer without a second
 *   write, a second session sweep or a second audit event. A repeat under a new key reaches the same
 *   end state, reports no sessions left to end and appends its own audit row — it is neither refused
 *   nor doubled (`C-093` Idempotency).
 * - **The password is not a fingerprint.** It never enters the replay store, so a replayed call cannot
 *   leak it through the idempotency record; the request is fingerprinted by its target and reason.
 *
 * The rate cap is the operator-configured staff-authentication bucket, counted against the operator's
 * own identifier. `C-093` makes the cap operator configuration (`NFR-027`) and fixes no separate
 * bucket; the platform's bucket list is the whole configurable surface.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type StaffCredentialState,
  type StaffRole,
  type StaffUser,
} from '../entities.ts';
import type { AuditAppendPort } from '../../audit/index.ts';
import type { ClockPort } from '../../ports/clock.ts';
import type { IdentifierPort } from '../../ports/identifiers.ts';
import { readIdempotencyKey, readPassword, staffActionRefusal, toIsoSeconds } from '../policies.ts';
import type {
  IdentityPorts,
  RateLimitPort,
  StaffCredentialPort,
  StaffCredentialResetPort,
  StaffResetTarget,
  StaffSessionPort,
  StaffUserPort,
} from '../ports.ts';
import {
  appendIdentityAudit,
  consumeRateLimit,
  fingerprintOf,
  isRecord,
  lookupReplay,
  recordAnswer,
  reusedKeyFailure,
} from './support.ts';

/** The longest reason `C-093` records beside the reset. */
const RESET_REASON_MAX_LENGTH = 500;

/** The `C-001` record identifier form a staff user identifier carries. */
const STAFF_ID_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;

/**
 * The limiter bucket the reset is counted in.
 *
 * `C-093` leaves the cap to operator configuration (`NFR-027`) and names no bucket of its own. The
 * platform exposes one staff-authentication bucket, and the subject is the operator's identifier, so
 * a reset is counted per operator against that bucket's configured cap without sharing a counter with
 * any operator's username-based sign-in attempts.
 */
const RESET_RATE_BUCKET = 'staff_sign_in';

/** The `C-093` request. The password is handed over in person and never echoed. */
export interface ResetStaffCredentialInput {
  /** The staff user being reset, never the caller's own identifier (`C-093` Self-reset). */
  readonly staffUserId: string;
  /** 12 to 128 characters; hashed with Argon2id before it is stored (`NFR-021`). */
  readonly newPassword: string;
  /** Why the reset was made, at most 500 characters, recorded on the audit row. */
  readonly reason: string;
  readonly idempotencyKey?: string;
}

/** The staff account as the `C-093` answer prints it. */
export interface ResetStaffCredentialStaff {
  readonly id: string;
  readonly fullName: string;
  readonly role: StaffRole;
  readonly external: boolean;
  readonly secondFactorEnrolled: false;
  readonly active: boolean;
}

/** The credential as the `C-093` answer prints it: state only, never a secret. */
export interface ResetStaffCredentialCredential {
  readonly passwordChangedAt: string;
  readonly secondFactorEnrolledAt: null;
  readonly failedAttemptCount: number;
  readonly lockedUntil: null;
}

/** The `C-093` answer. */
export interface ResetStaffCredentialApplied {
  readonly ok: true;
  readonly staffUser: ResetStaffCredentialStaff;
  readonly credential: ResetStaffCredentialCredential;
  /** How many live sessions the reset ended; `0` when there was nothing left to end. */
  readonly sessionsEnded: number;
  /** The only next step a reset leaves: the staff member enrols a second factor again. */
  readonly nextStep: 're_enrol';
}

/** The `C-093` answer, or the refusal that stopped the write. */
export type ResetStaffCredentialResult = ResetStaffCredentialApplied | IdentityFailure;

/** The panel's read: the accounts the operator may reset. */
export type ReadStaffResetTargetsResult =
  { readonly ok: true; readonly targets: readonly StaffResetTarget[] } | IdentityFailure;

/** Everything the reset and the panel's list need. */
export interface ResetStaffCredentialDeps {
  readonly credentials: Pick<StaffCredentialPort, 'findByStaffUserId' | 'verifyPassword'>;
  readonly reset: StaffCredentialResetPort;
  readonly staffUsers: StaffUserPort;
  readonly staffSessions: Pick<StaffSessionPort, 'endAllForStaff'>;
  readonly rateLimits: RateLimitPort;
  readonly idempotency: IdentityPorts['idempotency'];
  readonly audit: AuditAppendPort;
  readonly clock: ClockPort;
  readonly identifiers: IdentifierPort;
}

/** Narrows a recorded answer back to this operation's shape. */
function isApplied(value: unknown): value is ResetStaffCredentialApplied {
  return isRecord(value) && value['ok'] === true && isRecord(value['staffUser']);
}

/** The refusal an unauthenticated or wrong-role caller receives. */
function callerRefusal(caller: IdentityCaller): IdentityFailure | null {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'Sign in as the operator to reset a staff credential.',
      {},
      { meta: { recoveryPath: '/staff/sign-in' } },
    );
  }
  if (caller.kind === 'member') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_PRESENT',
      'A resident session cannot reset a staff credential.',
    );
  }
  if (caller.role !== 'operator') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'OPERATOR_REQUIRED',
      'Only the operator resets a staff credential.',
    );
  }
  return staffActionRefusal(caller);
}

/**
 * Appends `staff.credential_reset_refused` for one attempt.
 *
 * A refused attempt is never silently dropped (`operations.md` Audit trail), and the response is not
 * turned into a failure by the log: the refusal already tells the operator what happened, the same
 * way a refused sign-in does. The actor is the operator and the entity is the target, except where
 * the refusal is about the caller's own session, when the caller is the only entity there is.
 */
async function refuseReset(
  deps: Pick<ResetStaffCredentialDeps, 'audit' | 'identifiers'>,
  input: {
    readonly staffId: string;
    readonly role: StaffRole;
    readonly targetId: string;
    readonly reason: string;
    readonly occurredAt: string;
    readonly correlationId?: string;
  },
): Promise<void> {
  await appendIdentityAudit(deps, {
    actorId: input.staffId,
    actorRole: input.role,
    action: 'staff.credential_reset_refused',
    entityType: 'StaffUser',
    entityId: input.targetId,
    reason: input.reason,
    occurredAt: input.occurredAt,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
  });
}

/**
 * Reads the staff accounts the operator's credentials panel may reset.
 *
 * @param caller - The operator's satisfied staff session.
 * @param deps - The credential store's reset read.
 */
export async function readStaffResetTargets(
  caller: IdentityCaller,
  deps: Pick<ResetStaffCredentialDeps, 'reset'>,
): Promise<ReadStaffResetTargetsResult> {
  const refused = callerRefusal(caller);
  if (refused !== null) return refused;

  let targets: readonly StaffResetTarget[];
  try {
    targets = await deps.reset.listResetTargets();
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The staff list could not be read; the last successful list stands.',
    );
  }
  return { ok: true, targets };
}

/**
 * Applies one credential reset.
 *
 * @param caller - The operator's satisfied staff session.
 * @param deps - The credential, staff, session, limiter, replay and audit ports.
 * @param input - The target, the replacement password, the reason and the idempotency key.
 */
export async function resetStaffCredential(
  caller: IdentityCaller,
  deps: ResetStaffCredentialDeps,
  input: ResetStaffCredentialInput,
): Promise<ResetStaffCredentialResult> {
  const now = toIsoSeconds(deps.clock.now());
  const correlation =
    caller.kind === 'staff' && caller.correlationId !== undefined
      ? { correlationId: caller.correlationId }
      : {};

  const refused = callerRefusal(caller);
  if (refused !== null) {
    // A signed-in staff caller is an actor even when their role or factor refuses them. A member or a
    // signed-out visitor has no staff actor to record.
    if (caller.kind === 'staff') {
      await refuseReset(deps, {
        staffId: caller.staffId,
        role: caller.role,
        targetId: caller.staffId,
        reason: refused.cause,
        occurredAt: now,
        ...correlation,
      });
    }
    return refused;
  }
  if (caller.kind !== 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'OPERATOR_REQUIRED',
      'Only the operator resets a staff credential.',
    );
  }

  const fields: Record<string, IdentityFieldReason> = {};
  if (typeof input.staffUserId !== 'string' || input.staffUserId === '') {
    fields['staffUserId'] = 'REQUIRED';
  } else if (!STAFF_ID_PATTERN.test(input.staffUserId)) {
    fields['staffUserId'] = 'PATTERN_MISMATCH';
  }
  const password = readPassword(input.newPassword);
  if (!password.ok) fields['newPassword'] = password.reason;
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (reason.length === 0) {
    fields['reason'] = 'REQUIRED';
  } else if (reason.length > RESET_REASON_MAX_LENGTH) {
    fields['reason'] = 'TOO_LONG';
  } else if (password.ok && reason.includes(password.value)) {
    // `C-093`: the audit reason must not reproduce the password. The write is refused rather than
    // letting the operator's sentence carry a secret into the append-only log.
    fields['reason'] = 'PATTERN_MISMATCH';
  }
  const key = readIdempotencyKey(input.idempotencyKey);
  if (!key.ok) fields[key.field] = key.reason;

  if (Object.keys(fields).length > 0 || !password.ok || !key.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'STAFF_CREDENTIAL_RESET_INVALID',
      'The reset needs a staff member, a password of 12 to 128 characters, a reason and an idempotency key.',
      fields,
    );
  }

  if (input.staffUserId === caller.staffId) {
    await refuseReset(deps, {
      staffId: caller.staffId,
      role: caller.role,
      targetId: caller.staffId,
      reason: 'SELF_RESET_REQUIRES_SECOND_OPERATOR',
      occurredAt: now,
      ...correlation,
    });
    return identityFailure(
      'POLICY_VIOLATION',
      'SELF_RESET_REQUIRES_SECOND_OPERATOR',
      'You cannot reset your own credential. A second operator must do it.',
    );
  }

  // The password stays out of the fingerprint, so the replay store never holds a credential secret.
  // The replay is answered before the limiter, so a recorded write is never replaced by a cap refusal
  // (`C-001`, `C-093` Idempotency).
  const fingerprint = fingerprintOf([input.staffUserId, reason]);
  const replay = await lookupReplay(deps, key.value, fingerprint, isApplied);
  if (replay.kind === 'mismatch') return reusedKeyFailure();
  if (replay.kind === 'replay') return replay.result;

  const limited = await consumeRateLimit(deps, {
    bucket: RESET_RATE_BUCKET,
    subject: { kind: 'staff', value: caller.staffId },
  });
  if (!limited.ok) {
    return identityFailure(
      'SERVICE_DEGRADED',
      'RATE_LIMIT_UNAVAILABLE',
      'The reset could not be checked. Try again in a moment.',
    );
  }
  if (!limited.allowed) {
    await refuseReset(deps, {
      staffId: caller.staffId,
      role: caller.role,
      targetId: input.staffUserId,
      reason: 'STAFF_CREDENTIAL_RESET_RATE_LIMITED',
      occurredAt: now,
      ...correlation,
    });
    return identityFailure(
      'RATE_LIMITED',
      'STAFF_CREDENTIAL_RESET_RATE_LIMITED',
      'Too many resets from this account. Wait a moment before trying again.',
      {},
      { retryAfterSeconds: limited.retryAfterSeconds },
    );
  }

  let staff: StaffUser | null;
  try {
    staff = await deps.staffUsers.get(input.staffUserId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The staff account could not be read, so nothing was changed.',
    );
  }
  if (staff === null) {
    await refuseReset(deps, {
      staffId: caller.staffId,
      role: caller.role,
      targetId: input.staffUserId,
      reason: 'STAFF_USER_NOT_FOUND',
      occurredAt: now,
      ...correlation,
    });
    return identityFailure(
      'NOT_FOUND',
      'STAFF_USER_NOT_FOUND',
      'That staff account does not exist.',
    );
  }

  let credential: StaffCredentialState | null;
  try {
    credential = await deps.credentials.findByStaffUserId(input.staffUserId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The credential could not be read, so nothing was changed.',
    );
  }
  if (credential === null) {
    await refuseReset(deps, {
      staffId: caller.staffId,
      role: caller.role,
      targetId: input.staffUserId,
      reason: 'STAFF_CREDENTIAL_NOT_FOUND',
      occurredAt: now,
      ...correlation,
    });
    return identityFailure(
      'NOT_FOUND',
      'STAFF_CREDENTIAL_NOT_FOUND',
      'That staff account holds no credential to reset.',
    );
  }

  // `C-093` refuses a password that is already the current one — except when the credential is already
  // in the reset end state, because that is the repeat-under-a-new-key case the same entry says is
  // neither refused nor doubled. A credential with no enrolled factor is in that state.
  let matchesCurrent: boolean;
  try {
    matchesCurrent = await deps.credentials.verifyPassword(credential.id, password.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The password could not be checked, so nothing was changed.',
    );
  }
  if (matchesCurrent && credential.secondFactorEnrolledAt !== undefined) {
    await refuseReset(deps, {
      staffId: caller.staffId,
      role: caller.role,
      targetId: input.staffUserId,
      reason: 'PASSWORD_ALREADY_SET',
      occurredAt: now,
      ...correlation,
    });
    return identityFailure(
      'VALIDATION_FAILED',
      'STAFF_CREDENTIAL_RESET_INVALID',
      'Choose a password the staff member is not already using.',
      { newPassword: 'ALREADY_SET' },
    );
  }

  let updated: StaffCredentialState;
  try {
    updated = await deps.reset.resetCredential({
      credentialId: credential.id,
      newPassword: password.value,
      at: now,
    });
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The credential could not be reset, so nothing was changed.',
    );
  }

  try {
    await deps.staffUsers.setSecondFactorEnrolled(input.staffUserId, false, now);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The staff account could not be updated, so the reset did not finish.',
    );
  }

  let sessionsEnded: number;
  try {
    sessionsEnded = await deps.staffSessions.endAllForStaff(input.staffUserId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The staff member’s sessions could not be ended, so the reset did not finish.',
    );
  }

  const audited = await appendIdentityAudit(deps, {
    actorId: caller.staffId,
    actorRole: 'operator',
    action: 'staff.credential_reset',
    entityType: 'StaffUser',
    entityId: input.staffUserId,
    reason,
    occurredAt: now,
    ...correlation,
  });
  if (audited !== null) return audited;

  const result: ResetStaffCredentialApplied = {
    ok: true,
    staffUser: {
      id: staff.id,
      fullName: staff.fullName,
      role: staff.role,
      external: staff.external,
      secondFactorEnrolled: false,
      active: staff.active,
    },
    credential: {
      passwordChangedAt: updated.passwordChangedAt,
      secondFactorEnrolledAt: null,
      failedAttemptCount: updated.failedAttemptCount,
      lockedUntil: null,
    },
    sessionsEnded,
    nextStep: 're_enrol',
  };
  await recordAnswer(deps, key.value, fingerprint, result);
  return result;
}
