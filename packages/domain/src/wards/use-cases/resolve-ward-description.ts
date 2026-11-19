/**
 * Resolving a queued description (`C-056`, `FEAT-002`, screen 19).
 *
 * A reviewer either matches the description to a recorded ward - which records the ward on the
 * member and moves their unresolved in-state submissions there, without touching a word of their
 * text - or rejects it with a stated reason, leaving the member as they were. Neither outcome edits
 * the description itself: it is the resident's own words and the evidence a later reader can check.
 */
import {
  wardFailure,
  type WardCaller,
  type WardDescriptionReview,
  type WardFailure,
  type WardFieldReason,
} from '../entities.ts';
import {
  normaliseWardText,
  movesWithWardResolution,
  WARD_REJECTION_REASON_MAX_LENGTH,
} from '../policies.ts';
import type { WardPorts } from '../ports.ts';
import { appendWardAudit, emitWardAnalytics } from './support.ts';

/** The `C-056` request. */
export interface ResolveWardDescriptionInput {
  readonly reviewId: string;
  readonly status: 'resolved' | 'rejected';
  readonly resolvedWardId?: string | null;
  readonly rejectionReason?: string | null;
}

/** The member summary the resolution returns; `null` when the account row is gone. */
export interface ResolvedMember {
  readonly id: string;
  readonly wardId?: string;
  readonly wardStatus: 'resolved' | 'unresolved';
}

/** The `C-056` answer, or the refusal that stopped the write. */
export type ResolveWardDescriptionResult =
  | {
      readonly ok: true;
      readonly wardDescriptionReview: {
        readonly id: string;
        readonly status: 'resolved' | 'rejected';
        readonly resolvedWardId?: string;
        readonly rejectionReason?: string;
        readonly reviewerId: string;
        readonly resolvedAt: string;
      };
      readonly member: ResolvedMember | null;
      readonly submissionsMoved: readonly string[];
      readonly submissionsUnchanged: number;
    }
  | WardFailure;

/**
 * Applies one reviewer decision to a queued description.
 *
 * @param caller - The caller; `C-056` admits the response-staff role only.
 * @param deps - The review, ward, member, submission, audit, analytics, clock and identifier ports.
 * @param input - The review, the decision, and the ward or the reason.
 */
export async function resolveWardDescription(
  caller: WardCaller,
  deps: WardPorts,
  input: ResolveWardDescriptionInput,
): Promise<ResolveWardDescriptionResult> {
  if (caller.kind !== 'staff' || caller.role !== 'response_staff') {
    return wardFailure(
      'FORBIDDEN_ROLE',
      'WARD_REVIEWER_REQUIRED',
      'Only response staff can resolve a ward description.',
    );
  }

  const fields: Record<string, WardFieldReason> = {};
  if (typeof input.reviewId !== 'string' || input.reviewId === '') {
    fields['reviewId'] = 'REQUIRED';
  }
  if (input.status !== 'resolved' && input.status !== 'rejected') {
    fields['status'] = input.status === undefined ? 'REQUIRED' : 'ENUM_MISMATCH';
  }
  const rejectionReason =
    typeof input.rejectionReason === 'string' ? input.rejectionReason.trim() : '';
  if (
    input.status === 'resolved' &&
    (typeof input.resolvedWardId !== 'string' || input.resolvedWardId === '')
  ) {
    fields['resolvedWardId'] = 'REQUIRED';
  }
  if (input.status === 'rejected' && rejectionReason === '') {
    fields['rejectionReason'] = 'REQUIRED';
  }
  if (rejectionReason.length > WARD_REJECTION_REASON_MAX_LENGTH) {
    fields['rejectionReason'] = 'TOO_LONG';
  }
  if (Object.keys(fields).length > 0) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_RESOLUTION_INVALID',
      'A resolution needs a decision, and a reason when the description cannot be matched.',
      fields,
    );
  }

  let review: WardDescriptionReview | null;
  try {
    review = await deps.wardDescriptionReviews.findById(input.reviewId);
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'WARD_REVIEW_UNAVAILABLE',
      'The review could not be read, so nothing was changed.',
    );
  }
  if (review === null) {
    return wardFailure(
      'NOT_FOUND',
      'WARD_REVIEW_NOT_FOUND',
      'That description is not in the queue.',
    );
  }
  if (review.status !== 'queued') {
    return wardFailure(
      'CONFLICT_ALREADY_DECIDED',
      'WARD_DESCRIPTION_ALREADY_RESOLVED',
      'This description already has a decision.',
    );
  }

  let member: Awaited<ReturnType<WardPorts['members']['get']>>;
  try {
    member = await deps.members.get(review.memberId);
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'MEMBER_RECORD_UNAVAILABLE',
      'The account could not be read, so nothing was changed.',
    );
  }
  const accountGone = member === null || member.deletedAt !== undefined;

  const resolvedAt = deps.clock
    .now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');

  if (input.status === 'rejected') {
    const rejected = await deps.wardDescriptionReviews.markRejected({
      reviewId: review.id,
      rejectionReason,
      reviewerId: caller.staffId,
      resolvedAt,
    });
    if (!rejected) {
      return wardFailure(
        'CONFLICT_ALREADY_DECIDED',
        'WARD_DESCRIPTION_ALREADY_RESOLVED',
        'This description already has a decision.',
      );
    }

    const refused = await appendWardAudit(deps, {
      actorId: caller.staffId,
      actorRole: 'response_staff',
      action: 'ward.rejected',
      entityType: 'WardDescriptionReview',
      entityId: review.id,
      // A stable token: the reviewer's sentence is held on the record, not copied into the log.
      reason: 'DESCRIPTION_NOT_MATCHED',
      occurredAt: resolvedAt,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
    if (refused !== null) return refused;

    await emitWardAnalytics(deps, [
      { name: 'ward_review_resolved', properties: { resolution: 'rejected' } },
    ]);

    return {
      ok: true,
      wardDescriptionReview: {
        id: review.id,
        status: 'rejected',
        rejectionReason,
        reviewerId: caller.staffId,
        resolvedAt,
      },
      member: member === null ? null : summariseMember(member),
      submissionsMoved: [],
      submissionsUnchanged: await countWithWard(deps, review.memberId),
    };
  }

  // Resolving needs a member to attach the ward to; the anonymised row is not enough.
  if (accountGone) {
    return wardFailure(
      'POLICY_VIOLATION',
      'MEMBER_ACCOUNT_DELETED',
      'The account behind this description was deleted; the review can only be rejected.',
    );
  }
  if (member === null) {
    // Unreachable after the check above; kept so the narrowing is explicit to TypeScript.
    return wardFailure('POLICY_VIOLATION', 'MEMBER_ACCOUNT_DELETED', 'The account is gone.');
  }

  const resolvedWardId = input.resolvedWardId as string;
  let ward: Awaited<ReturnType<WardPorts['wards']['getById']>>;
  try {
    ward = await deps.wards.getById(resolvedWardId);
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'WARD_REFERENCE_UNAVAILABLE',
      'The ward reference could not be read, so nothing was changed.',
    );
  }
  if (ward === null) {
    return wardFailure('NOT_FOUND', 'WARD_NOT_FOUND', 'That ward is not in the reference.', {
      resolvedWardId: 'NOT_FOUND',
    });
  }

  const marked = await deps.wardDescriptionReviews.markResolved({
    reviewId: review.id,
    wardId: ward.id,
    reviewerId: caller.staffId,
    resolvedAt,
  });
  if (!marked) {
    return wardFailure(
      'CONFLICT_ALREADY_DECIDED',
      'WARD_DESCRIPTION_ALREADY_RESOLVED',
      'This description already has a decision.',
    );
  }

  await deps.members.recordWard(member.id, ward.id);

  const authorSubmissions = await deps.submissions.listUnresolvedByAuthor(member.id);
  const movable = authorSubmissions.filter((submission) => movesWithWardResolution(submission));
  // Counted before the move: "unchanged" means submissions resolution did not touch.
  const unchanged = await countWithWard(deps, member.id);
  const moved =
    movable.length === 0
      ? []
      : await deps.submissions.assignWard(
          movable.map((submission) => submission.id),
          ward.id,
        );

  // The resident's wording accumulates into the reference a reviewer just settled (`FEAT-002`).
  const alreadyKnown =
    normaliseWardText(ward.name) === normaliseWardText(review.description) ||
    ward.aliases.some(
      (alias) => normaliseWardText(alias) === normaliseWardText(review.description),
    );
  if (!alreadyKnown) {
    await deps.wards.appendAlias({ wardId: ward.id, alias: review.description });
  }

  const refused = await appendWardAudit(deps, {
    actorId: caller.staffId,
    actorRole: 'response_staff',
    action: 'ward.resolved',
    entityType: 'WardDescriptionReview',
    entityId: review.id,
    occurredAt: resolvedAt,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  await emitWardAnalytics(deps, [
    { name: 'ward_review_resolved', properties: { resolution: 'resolved' } },
  ]);

  return {
    ok: true,
    wardDescriptionReview: {
      id: review.id,
      status: 'resolved',
      resolvedWardId: ward.id,
      reviewerId: caller.staffId,
      resolvedAt,
    },
    member: { id: member.id, wardId: ward.id, wardStatus: 'resolved' },
    submissionsMoved: moved,
    submissionsUnchanged: unchanged,
  };
}

/** The member summary in the `C-056` shape. */
function summariseMember(member: {
  readonly id: string;
  readonly wardId?: string;
  readonly wardStatus: 'resolved' | 'unresolved';
}): ResolvedMember {
  return member.wardStatus === 'resolved' && member.wardId !== undefined
    ? { id: member.id, wardId: member.wardId, wardStatus: 'resolved' }
    : { id: member.id, wardStatus: 'unresolved' };
}

/** How many of the member's submissions already carry a ward and are therefore left alone. */
async function countWithWard(deps: WardPorts, memberId: string): Promise<number> {
  try {
    return await deps.submissions.countWithWardByAuthor(memberId);
  } catch {
    return 0;
  }
}
