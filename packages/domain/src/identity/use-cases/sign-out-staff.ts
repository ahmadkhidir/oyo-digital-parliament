/**
 * Ending the current staff session (`C-092`, `NFR-026`, `NFR-028`).
 *
 * Ends the session the cookie names and clears it. A role change, a deactivation, an operator reset or
 * the absolute timeout end every session for the user; this action never reaches another device's
 * session, and a resident session cannot call it.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
} from '../entities.ts';
import { readIdempotencyKey, toIsoSeconds } from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import {
  appendIdentityAudit,
  isRecord,
  lookupReplay,
  recordAnswer,
  reusedKeyFailure,
} from './support.ts';

/** The `C-092` sign-out request. `scope` names the current session only. */
export interface SignOutStaffInput {
  /** The untrusted request value; only `current` is accepted. */
  readonly scope?: string;
  readonly idempotencyKey?: string;
}

/** The `C-092` answer: the cookie is cleared by the transport. */
export type SignOutStaffResult = { readonly ok: true } | IdentityFailure;

/** Narrows a recorded answer back to this operation's shape. */
function isSignedOut(value: unknown): value is { readonly ok: true } {
  return isRecord(value) && value['ok'] === true;
}

/**
 * Ends the caller's current staff session.
 *
 * @param caller - The staff session being ended.
 * @param deps - The staff session, idempotency and audit ports.
 * @param input - The scope and the idempotency key.
 */
export async function signOutStaff(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: SignOutStaffInput,
): Promise<SignOutStaffResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'There is no staff session to end.',
    );
  }
  if (caller.kind === 'member') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_PRESENT',
      'A resident session cannot sign out of the staff console.',
    );
  }

  const fields: Record<string, IdentityFieldReason> = {};
  if (input.scope !== undefined && input.scope !== 'current') {
    fields['scope'] = 'ENUM_MISMATCH';
  }
  const key = readIdempotencyKey(input.idempotencyKey);
  if (!key.ok) fields[key.field] = key.reason;
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'STAFF_SIGN_OUT_INVALID',
      'The sign-out request could not be read.',
      fields,
    );
  }
  if (!key.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'STAFF_SIGN_OUT_INVALID',
      'The sign-out request could not be read.',
    );
  }

  const fingerprint = `${caller.staffId}:current`;
  const replay = await lookupReplay(deps, key.value, fingerprint, isSignedOut);
  if (replay.kind === 'mismatch') return reusedKeyFailure();
  if (replay.kind === 'replay') return replay.result;

  try {
    await deps.staffSessions.end(caller.sessionId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The session could not be ended. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: caller.staffId,
    actorRole: caller.role,
    action: 'staff.signed_out',
    entityType: 'StaffUser',
    entityId: caller.staffId,
    occurredAt: toIsoSeconds(deps.clock.now()),
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  const result: { readonly ok: true } = { ok: true };
  await recordAnswer(deps, key.value, fingerprint, result);
  return result;
}
