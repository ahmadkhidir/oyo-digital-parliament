/**
 * Anonymising a member (`C-070` `anonymiseMember`, `FEAT-012`, `NFR-040`).
 *
 * The identity service's only deletion operation. Direct identifiers are removed, the account row stays
 * so the public record keeps a non-identifying author reference, and the member's submissions change
 * state to withdrawn by author rather than disappearing. A record under an open legal hold is deferred
 * with its review date, never refused silently.
 */
import { identityFailure, type IdentityCaller, type IdentityFailure } from '../entities.ts';
import { mayReadMemberPersonalData, toIsoSeconds } from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import { appendIdentityAudit } from './support.ts';

/** The `C-070` arguments this operation needs. */
export interface AnonymiseMemberInput {
  readonly memberId: string;
  /** A stable token naming why the record is being removed, never free text or a person's data. */
  readonly reason: string;
}

/** The anonymisation answer. It carries no personal field. */
export type AnonymiseMemberResult =
  | {
      readonly ok: true;
      readonly memberId: string;
      readonly deletedAt: string;
      readonly submissionsWithdrawn: number;
    }
  | IdentityFailure;

/**
 * Removes a member's direct identifiers and withdraws their authored submissions.
 *
 * @param caller - The member themself, or the operator completing a data request.
 * @param deps - The member, content, legal-hold and audit ports.
 * @param input - The member and the reason recorded on the audit entry.
 */
export async function anonymiseMember(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: AnonymiseMemberInput,
): Promise<AnonymiseMemberResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Sign in to delete your account.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (typeof input.memberId !== 'string' || input.memberId === '') {
    return identityFailure(
      'VALIDATION_FAILED',
      'ANONYMISATION_INVALID',
      'The request names no member.',
      { memberId: 'REQUIRED' },
    );
  }
  if (
    typeof input.reason !== 'string' ||
    input.reason.trim().length === 0 ||
    input.reason.length > 1000
  ) {
    return identityFailure(
      'VALIDATION_FAILED',
      'ANONYMISATION_INVALID',
      'A reason is required and must be at most 1000 characters.',
      { reason: input.reason === undefined ? 'REQUIRED' : 'TOO_LONG' },
    );
  }
  // `C-070`: only the member's own request or the operator holding the member-data permission.
  const permitted =
    mayReadMemberPersonalData({
      caller,
      purpose: 'member_data_request',
      memberId: input.memberId,
    }) ||
    (caller.kind === 'staff' && caller.role === 'operator');
  if (!permitted) {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'PERSONAL_DATA_PERMISSION_ABSENT',
      'This session may not delete a member’s record.',
    );
  }

  const member = await safeGet(deps, input.memberId);
  if (member === 'degraded') {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The account could not be read, so nothing was removed.',
    );
  }
  if (member === null) {
    return identityFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account does not exist.');
  }
  if (member.deletedAt !== undefined) {
    // Removal is a state change, and a second request changes nothing.
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'MEMBER_ALREADY_ANONYMISED',
      'That account has already been deleted.',
    );
  }

  let hold: { readonly reviewDate: string } | null;
  try {
    hold = await deps.legalHolds.findOpenForMember(input.memberId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The record could not be checked for a legal hold, so nothing was removed.',
    );
  }
  if (hold !== null) {
    return identityFailure(
      'LEGAL_HOLD',
      'LEGAL_HOLD_OPEN',
      'Part of this record is under legal review, so deletion is paused until it is reviewed.',
      {},
      { meta: { reviewDate: hold.reviewDate } },
    );
  }

  const now = toIsoSeconds(deps.clock.now());
  let submissionsWithdrawn: number;
  try {
    await deps.members.anonymise(input.memberId, now);
    submissionsWithdrawn = await deps.memberContent.withdrawAuthoredSubmissions(
      input.memberId,
      now,
    );
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The record could not be deleted. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: caller.kind === 'member' ? caller.memberId : caller.staffId,
    actorRole: caller.kind === 'member' ? 'member' : caller.role,
    action: 'member_data.deleted',
    entityType: 'Member',
    entityId: input.memberId,
    reason: input.reason.trim(),
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  return { ok: true, memberId: input.memberId, deletedAt: now, submissionsWithdrawn };
}

/** Reads the member, distinguishing "no such row" from "the store did not answer". */
async function safeGet(
  deps: IdentityPorts,
  memberId: string,
): Promise<Awaited<ReturnType<IdentityPorts['members']['get']>> | 'degraded'> {
  try {
    return await deps.members.get(memberId);
  } catch {
    return 'degraded';
  }
}
