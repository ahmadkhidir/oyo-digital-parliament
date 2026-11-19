/**
 * Recording a residence review (`C-057`, `FEAT-001`, `EVT-005`, `EVT-047`).
 *
 * The review is the only route from `registered` to `checked`. An acceptance records the review and
 * moves the member's identity state; a rejection records the review, leaves the member registered
 * and leaves the reason on the record for the next attempt. Neither outcome touches the ward: that is
 * `C-011` and `C-056`, and mixing the two would let a review silently relocate someone.
 */
import {
  RESIDENCE_REVIEW_DECISIONS,
  RESIDENCE_REVIEW_METHODS,
  wardFailure,
  type ResidenceReview,
  type ResidenceReviewDecision,
  type ResidenceReviewMethod,
  type WardCaller,
  type WardFailure,
  type WardFieldReason,
} from '../entities.ts';
import {
  identityStateAfterReview,
  readResidenceNotes,
  residenceReviewNeedsRecordedWard,
} from '../policies.ts';
import type { WardPorts } from '../ports.ts';
import { appendWardAudit, emitWardAnalytics } from './support.ts';

/** The `C-057` request. */
export interface RecordResidenceReviewInput {
  readonly memberId: string;
  readonly method: ResidenceReviewMethod;
  readonly decision: ResidenceReviewDecision;
  readonly notes?: string;
}

/** The `C-057` answer, or the refusal that stopped the write. */
export type RecordResidenceReviewResult =
  | {
      readonly ok: true;
      readonly residenceReview: {
        readonly id: string;
        readonly memberId: string;
        readonly reviewerId: string;
        readonly method: ResidenceReviewMethod;
        readonly decision: ResidenceReviewDecision;
        readonly reviewedAt: string;
      };
      readonly member: { readonly identityState: 'registered' | 'checked' };
      /** Active backings whose snapshot the change makes stale for display; never rewritten. */
      readonly backingsUpdated: number;
    }
  | WardFailure;

/**
 * Records one residence review.
 *
 * @param caller - The caller; `C-057` admits the response-staff role only.
 * @param deps - The member, residence review, backing, audit, analytics, clock and identifier ports.
 * @param input - The member, the method, the decision and the reviewer's note.
 */
export async function recordResidenceReview(
  caller: WardCaller,
  deps: WardPorts,
  input: RecordResidenceReviewInput,
): Promise<RecordResidenceReviewResult> {
  if (caller.kind !== 'staff' || caller.role !== 'response_staff') {
    return wardFailure(
      'FORBIDDEN_ROLE',
      'WARD_REVIEWER_REQUIRED',
      'Only response staff can record a residence review.',
    );
  }

  const fields: Record<string, WardFieldReason> = {};
  if (typeof input.memberId !== 'string' || input.memberId === '') {
    fields['memberId'] = 'REQUIRED';
  }
  if (!(RESIDENCE_REVIEW_METHODS as readonly unknown[]).includes(input.method)) {
    fields['method'] = input.method === undefined ? 'REQUIRED' : 'ENUM_MISMATCH';
  }
  if (!(RESIDENCE_REVIEW_DECISIONS as readonly unknown[]).includes(input.decision)) {
    fields['decision'] = input.decision === undefined ? 'REQUIRED' : 'ENUM_MISMATCH';
  }
  const notes = readResidenceNotes(input.notes);
  if (!notes.ok) Object.assign(fields, notes.fields);
  if (Object.keys(fields).length > 0) {
    return wardFailure(
      'VALIDATION_FAILED',
      'RESIDENCE_REVIEW_INVALID',
      'A residence review needs a method and a decision, and a note no longer than the field allows.',
      fields,
    );
  }
  if (!notes.ok) {
    return wardFailure('VALIDATION_FAILED', 'RESIDENCE_REVIEW_INVALID', 'The review is invalid.');
  }

  let member: Awaited<ReturnType<WardPorts['members']['get']>>;
  try {
    member = await deps.members.get(input.memberId);
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'MEMBER_RECORD_UNAVAILABLE',
      'The account could not be read, so no review was recorded.',
    );
  }
  if (member === null || member.deletedAt !== undefined) {
    return wardFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account does not exist.');
  }

  if (
    residenceReviewNeedsRecordedWard(input.decision) &&
    (member.wardStatus !== 'resolved' || member.wardId === undefined)
  ) {
    return wardFailure(
      'POLICY_VIOLATION',
      'WARD_UNRESOLVED',
      'A residence cannot be checked before the member’s ward is recorded.',
    );
  }

  const reviewedAt = deps.clock
    .now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  const review: ResidenceReview = {
    id: deps.identifiers.next('rvd'),
    memberId: member.id,
    reviewerId: caller.staffId,
    method: input.method,
    ...(notes.value === undefined ? {} : { notes: notes.value }),
    decision: input.decision,
    reviewedAt,
  };
  await deps.residenceReviews.record(review);

  const nextState = identityStateAfterReview(member.identityState, input.decision);
  const changed = nextState !== member.identityState;
  if (changed) await deps.members.setIdentityState(member.id, nextState);

  let backingsUpdated = 0;
  if (changed) {
    try {
      backingsUpdated = await deps.backings.countByMember(member.id);
    } catch {
      // The count is a display figure on the reviewer's screen; the review itself stands.
      backingsUpdated = 0;
    }
  }

  const refused = await appendWardAudit(deps, {
    actorId: caller.staffId,
    actorRole: 'response_staff',
    action: 'residence.reviewed',
    entityType: 'ResidenceReview',
    entityId: review.id,
    occurredAt: reviewedAt,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  const events = [
    {
      name: 'residence_review_completed' as const,
      properties: { decision: input.decision, method: input.method },
    },
    ...(changed
      ? [
          {
            name: 'identity_state_changed' as const,
            properties: { from_state: member.identityState, to_state: nextState },
          },
        ]
      : []),
  ];
  await emitWardAnalytics(deps, events);

  return {
    ok: true,
    residenceReview: {
      id: review.id,
      memberId: review.memberId,
      reviewerId: review.reviewerId,
      method: review.method,
      decision: review.decision,
      reviewedAt: review.reviewedAt,
    },
    member: { identityState: nextState },
    backingsUpdated,
  };
}
