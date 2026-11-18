/**
 * Starting a staff sign-in (`C-092`, `NFR-020`, `NFR-021`, `NFR-028`).
 *
 * The password step opens a challenge session and nothing more: the second factor is still owed, so no
 * admin operation is authorised. An unknown username and a wrong password take the same work and answer
 * the same way, so the screen cannot be used to discover which usernames exist.
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
  isPast,
  readIdempotencyKey,
  readPassword,
  readUsername,
  secondsUntil,
  staffChallengeWindow,
  staffLockState,
  toIsoSeconds,
} from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import {
  liveSessionCookie,
  rateLimitHeaders,
  type RateLimitHeaders,
  type SessionCookie,
} from '../../ports/session.ts';
import {
  appendIdentityAudit,
  fingerprintOf,
  isRecord,
  lookupReplay,
  recordAnswer,
  refuseStaffSignIn,
  reusedKeyFailure,
} from './support.ts';

/** The `C-092` sign-in challenge request. */
export interface BeginStaffSignInInput {
  readonly username: string;
  readonly password: string;
  readonly idempotencyKey?: string;
  /** The request's source address, for the per-address cap. Never stored as an identity. */
  readonly sourceAddress?: string;
}

/** The `C-092` challenge answer. */
export interface StaffChallengeOpened {
  readonly ok: true;
  readonly session: {
    readonly established: true;
    readonly secondFactorSatisfied: false;
    readonly expiresAt: string;
    readonly absoluteExpiresAt: string;
  };
  readonly secondFactorEnrolled: boolean;
  readonly nextScreen: '/admin/verify' | '/admin/enrol';
  /**
   * The cookie the transport must set (`C-092`, `NFR-026`). It is not part of the response body: the
   * opaque session token reaches the browser in this header and nowhere else.
   */
  readonly cookie?: SessionCookie;
  /** The `C-001` rate-limit headers this request's limiter answer produced. */
  readonly rateLimit?: RateLimitHeaders;
}

/** The `C-092` answer, or the refusal that stopped it. */
export type BeginStaffSignInResult = StaffChallengeOpened | IdentityFailure;

/** Narrows a recorded answer back to this operation's shape. */
function isChallengeOpened(value: unknown): value is StaffChallengeOpened {
  return isRecord(value) && value['ok'] === true && isRecord(value['session']);
}

/**
 * Opens one staff challenge from a username and password.
 *
 * @param caller - A signed-out caller; a member session is refused.
 * @param deps - The credential, staff, session, limiter, idempotency and audit ports.
 * @param input - The credential, the idempotency key and the source address.
 */
export async function beginStaffSignIn(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: BeginStaffSignInInput,
): Promise<BeginStaffSignInResult> {
  if (caller.kind === 'member') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_PRESENT',
      'A resident session cannot open the staff console.',
    );
  }
  if (caller.kind === 'staff') {
    return identityFailure(
      'POLICY_VIOLATION',
      'STAFF_SESSION_PRESENT',
      'This browser already holds a staff session.',
      {},
      { meta: { recoveryPath: '/admin' } },
    );
  }

  const username = readUsername(input.username);
  const password = readPassword(input.password);
  const key = readIdempotencyKey(input.idempotencyKey);
  const fields: Record<string, IdentityFieldReason> = {};
  for (const reading of [username, password, key]) {
    if (!reading.ok) fields[reading.field] = reading.reason;
  }
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'STAFF_SIGN_IN_INVALID',
      'Enter your staff username and password.',
      fields,
    );
  }
  if (!username.ok || !password.ok || !key.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'STAFF_SIGN_IN_INVALID',
      'Enter your staff username and password.',
    );
  }

  // The password is deliberately not part of the fingerprint: a secret never enters the replay store.
  const fingerprint = fingerprintOf([username.value]);
  const replay = await lookupReplay(deps, key.value, fingerprint, isChallengeOpened);
  if (replay.kind === 'mismatch') return reusedKeyFailure();
  if (replay.kind === 'replay') return replay.result;

  const limited = await consultLimiter(deps, {
    bucket: 'staff_sign_in',
    ...(input.sourceAddress === undefined
      ? { subject: { kind: 'staff' as const, value: username.value } }
      : { subject: { kind: 'address' as const, value: input.sourceAddress } }),
  });
  if (!limited.ok) {
    return identityFailure(
      'SERVICE_DEGRADED',
      'RATE_LIMIT_UNAVAILABLE',
      'The sign-in could not be checked. Try again in a moment.',
    );
  }
  if (!limited.allowed) {
    return identityFailure(
      'RATE_LIMITED',
      'STAFF_SIGN_IN_RATE_LIMITED',
      'Too many sign-in attempts. Wait a moment before trying again.',
      {},
      { retryAfterSeconds: limited.retryAfterSeconds },
    );
  }

  const now = toIsoSeconds(deps.clock.now());

  let credential: StaffCredentialState | null;
  try {
    credential = await deps.credentials.findByUsername(username.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The sign-in could not be checked. Try again in a moment.',
    );
  }

  if (credential === null) {
    // Do the same work as a wrong password, then refuse identically. No actor exists to audit.
    try {
      await deps.credentials.verifyPassword(null, password.value);
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'CREDENTIAL_STORE_UNAVAILABLE',
        'The sign-in could not be checked. Try again in a moment.',
      );
    }
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_CREDENTIALS_INVALID',
      'That username and password do not match.',
    );
  }

  let staff: StaffUser | null;
  try {
    staff = await deps.staffUsers.get(credential.staffUserId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The sign-in could not be checked. Try again in a moment.',
    );
  }
  if (staff === null) {
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_CREDENTIALS_INVALID',
      'That username and password do not match.',
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
  if (!staff.active) {
    await refuseStaffSignIn(deps, {
      staffId: staff.id,
      role: staff.role,
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

  let verified: boolean;
  try {
    verified = await deps.credentials.verifyPassword(credential.id, password.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The sign-in could not be checked. Try again in a moment.',
    );
  }

  if (!verified) {
    let failure: { readonly failedAttemptCount: number; readonly lockedUntil?: string };
    try {
      failure = await deps.credentials.recordFailure(credential.id, {
        at: now,
        lockAttemptLimit: STAFF_LOCK_ATTEMPT_LIMIT,
        lockWindowSeconds: STAFF_LOCK_WINDOW_SECONDS,
        lockSeconds: STAFF_LOCK_SECONDS,
      });
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'CREDENTIAL_STORE_UNAVAILABLE',
        'The sign-in could not be checked. Try again in a moment.',
      );
    }
    await refuseStaffSignIn(deps, {
      staffId: staff.id,
      role: staff.role,
      reason: 'CREDENTIALS_INVALID',
      occurredAt: now,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
    if (failure.lockedUntil !== undefined && !isPast(failure.lockedUntil, now)) {
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
      'STAFF_CREDENTIALS_INVALID',
      'That username and password do not match.',
    );
  }

  try {
    await deps.credentials.clearFailures(credential.id, now);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The sign-in could not be completed. Try again in a moment.',
    );
  }

  const window = staffChallengeWindow(now);
  let sessionId: string;
  try {
    ({ sessionId } = await deps.staffSessions.create({
      staffId: staff.id,
      at: now,
      expiresAt: window.expiresAt,
      absoluteExpiresAt: window.absoluteExpiresAt,
    }));
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The sign-in could not be started. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: staff.id,
    actorRole: staff.role,
    action: 'staff.sign_in_started',
    entityType: 'StaffUser',
    entityId: staff.id,
    reason: 'PASSWORD_ACCEPTED',
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  const enrolled = credential.secondFactorEnrolledAt !== undefined;
  // Recorded without the transport material: the replay store keeps the answer, and a session token
  // belongs in the session store only, where it is held as a digest (`NFR-026`).
  const result: StaffChallengeOpened = {
    ok: true,
    session: {
      established: true,
      secondFactorSatisfied: false,
      expiresAt: window.expiresAt,
      absoluteExpiresAt: window.absoluteExpiresAt,
    },
    secondFactorEnrolled: enrolled,
    nextScreen: enrolled ? '/admin/verify' : '/admin/enrol',
  };
  await recordAnswer(deps, key.value, fingerprint, result);

  const cookie = liveSessionCookie({
    namespace: 'staff',
    token: sessionId,
    expiresAt: window.expiresAt,
    absoluteExpiresAt: window.absoluteExpiresAt,
    now,
  });
  const headers = rateLimitHeaders(limited.outcome);
  return {
    ...result,
    ...(cookie === null ? {} : { cookie }),
    ...(headers === null ? {} : { rateLimit: headers }),
  };
}

/** One limiter consult that keeps the header values, with a store failure kept apart from a refusal. */
async function consultLimiter(
  deps: Pick<IdentityPorts, 'rateLimits'>,
  input: Parameters<IdentityPorts['rateLimits']['consume']>[0],
): Promise<
  | {
      readonly ok: true;
      readonly allowed: boolean;
      readonly retryAfterSeconds: number;
      readonly outcome: Awaited<ReturnType<IdentityPorts['rateLimits']['consume']>>;
    }
  | { readonly ok: false }
> {
  try {
    const outcome = await deps.rateLimits.consume(input);
    return {
      ok: true,
      allowed: outcome.allowed,
      retryAfterSeconds: outcome.retryAfterSeconds,
      outcome,
    };
  } catch {
    return { ok: false };
  }
}
