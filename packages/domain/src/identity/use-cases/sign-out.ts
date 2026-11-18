/**
 * Ending the current session (`C-008`, `NFR-026`).
 *
 * Ends exactly the session the caller holds. `C-008`'s authority is explicit that another device's
 * session is untouched, so the `allSessions` field the request shape carries is answered by this
 * action ending the current session only; a staff session is refused because it signs out through the
 * staff flow (`C-092`).
 */
import { identityFailure, type IdentityCaller, type IdentityFailure } from '../entities.ts';
import { toIsoSeconds } from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import { appendIdentityAudit } from './support.ts';

/** The `C-008` request. */
export interface SignOutInput {
  readonly allSessions?: boolean;
}

/** The `C-008` answer: the cookie is cleared by the transport. */
export type SignOutResult = { readonly ok: true } | IdentityFailure;

/**
 * Ends the caller's current member session.
 *
 * @param caller - The member session being ended.
 * @param deps - The session and audit ports.
 * @param input - The request shape's `allSessions` flag, which never widens the scope here.
 */
export async function signOut(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: SignOutInput,
): Promise<SignOutResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'There is no session to end.',
    );
  }
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'Staff sessions end through the staff sign-out.',
      {},
      { meta: { recoveryPath: '/admin' } },
    );
  }
  if (input.allSessions !== undefined && typeof input.allSessions !== 'boolean') {
    return identityFailure(
      'VALIDATION_FAILED',
      'SIGN_OUT_INVALID',
      'The sign-out request could not be read.',
      { allSessions: 'PATTERN_MISMATCH' },
    );
  }

  try {
    await deps.memberSessions.end(caller.sessionId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The session could not be ended. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: caller.memberId,
    actorRole: 'member',
    action: 'member.signed_out',
    entityType: 'Member',
    entityId: caller.memberId,
    occurredAt: toIsoSeconds(deps.clock.now()),
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  return { ok: true };
}
