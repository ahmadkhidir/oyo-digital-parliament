'use server';

/**
 * The ward review queue's three writes (`C-056`, `C-057`, `screens/19-ward-review-queue.md`).
 *
 * One exported action per contract entry. Each resolves the staff session again rather than trusting
 * the page that rendered the form, checks the response-staff role, and hands the domain the caller's
 * identifier and the reviewed member's pseudonymous analytics context. A refusal writes the stable
 * cause into the flow cookie and returns to the queue; a success writes its result notice, including
 * how many submissions moved and how many already carried a ward.
 */
import { redirect } from 'next/navigation';
import {
  recordResidenceReview,
  resolveWardDescription,
  type RecordResidenceReviewInput,
  type ResidenceReviewDecision,
  type ResidenceReviewMethod,
  type WardCaller,
  type WardFailure,
} from '@odp/domain';
import { newCorrelationId } from '../../../../../lib/logging';
import { resolveLocale } from '../../../../../lib/i18n/locale';
import { getStaffAdminDependencies } from '../../../../../lib/staff-session/deps';
import { readStaffAccess } from '../../../../../lib/staff-session/session';
import { readWardReviewPorts, wardPortsForRequest } from '../../../../../lib/staff-session/deps';
import { writeStaffFlow, type StaffFlowCause } from '../../../../../lib/staff-session/cookies';

const QUEUE = '/admin/wards/review';

/** Reads one string field from the form. */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** The queue's caller, or `null` when the session is not a satisfied response-staff session. */
async function reviewerCaller(): Promise<WardCaller | null> {
  const access = await readStaffAccess();
  if (access.kind !== 'ready' || access.staff.role !== 'response_staff') return null;
  return {
    kind: 'staff',
    staffId: access.staff.id,
    role: 'response_staff',
    correlationId: newCorrelationId(),
  };
}

/** Maps a ward refusal onto the flow cookie's stable cause. */
function wardCause(failure: WardFailure): StaffFlowCause {
  const cause = failure.cause;
  switch (cause) {
    case 'WARD_RESOLUTION_INVALID':
    case 'WARD_REVIEW_NOT_FOUND':
    case 'WARD_DESCRIPTION_ALREADY_RESOLVED':
    case 'MEMBER_ACCOUNT_DELETED':
    case 'WARD_NOT_FOUND':
    case 'MEMBER_NOT_FOUND':
    case 'RESIDENCE_REVIEW_INVALID':
    case 'WARD_UNRESOLVED':
    case 'WARD_REVIEWER_REQUIRED':
      return cause;
    default:
      return 'DEGRADED';
  }
}

/** Resolves one description to a ward, or refuses with the reviewer's sentence. */
export async function resolveWardDescriptionAction(formData: FormData): Promise<void> {
  const reviewer = await reviewerCaller();
  if (reviewer === null) {
    await writeStaffFlow({ cause: 'WARD_REVIEWER_REQUIRED' });
    redirect(QUEUE);
  }

  const dependencies = await getStaffAdminDependencies();
  const reviewId = readField(formData, 'reviewId');
  const decision = readField(formData, 'decision');
  if (decision !== 'resolved' && decision !== 'rejected') {
    await writeStaffFlow({ cause: 'WARD_RESOLUTION_INVALID' });
    redirect(QUEUE);
  }

  const readPorts = readWardReviewPorts(dependencies.database);
  let memberId: string;
  try {
    const review = await readPorts.wardDescriptionReviews.findById(reviewId);
    if (review === null) {
      await writeStaffFlow({ cause: 'WARD_REVIEW_NOT_FOUND' });
      redirect(QUEUE);
    }
    memberId = review.memberId;
  } catch {
    await writeStaffFlow({ cause: 'DEGRADED' });
    redirect(QUEUE);
  }

  const wardPorts = wardPortsForRequest({
    platform: dependencies.platform,
    executor: dependencies.database.db,
    memberId,
    locale: await resolveLocale(),
    ...(reviewer.correlationId === undefined
      ? {}
      : { correlationId: reviewer.correlationId }),
  });

  const result = await resolveWardDescription(reviewer, wardPorts, {
    reviewId,
    status: decision,
    ...(decision === 'resolved'
      ? { resolvedWardId: readField(formData, 'resolvedWardId') }
      : { rejectionReason: readField(formData, 'rejectionReason') }),
  });

  if (!result.ok) {
    await writeStaffFlow({ cause: wardCause(result) });
    redirect(QUEUE);
  }

  await writeStaffFlow(
    decision === 'resolved'
      ? {
          notice: 'WARD_RESOLVED',
          moved: result.submissionsMoved.length,
          unchanged: result.submissionsUnchanged,
        }
      : { notice: 'WARD_REJECTED', unchanged: result.submissionsUnchanged },
  );
  redirect(QUEUE);
}

/** Records a residence review for the member behind the selected description. */
export async function recordResidenceReviewAction(formData: FormData): Promise<void> {
  const reviewer = await reviewerCaller();
  if (reviewer === null) {
    await writeStaffFlow({ cause: 'WARD_REVIEWER_REQUIRED' });
    redirect(QUEUE);
  }

  const dependencies = await getStaffAdminDependencies();
  const memberId = readField(formData, 'memberId');
  const method = readField(formData, 'method') as ResidenceReviewMethod;
  const decision = readField(formData, 'decision') as ResidenceReviewDecision;
  const notes = readField(formData, 'notes');

  const wardPorts = wardPortsForRequest({
    platform: dependencies.platform,
    executor: dependencies.database.db,
    memberId,
    locale: await resolveLocale(),
    ...(reviewer.correlationId === undefined
      ? {}
      : { correlationId: reviewer.correlationId }),
  });

  const input: RecordResidenceReviewInput = {
    memberId,
    method,
    decision,
    ...(notes.trim() === '' ? {} : { notes }),
  };
  const result = await recordResidenceReview(reviewer, wardPorts, input);
  if (!result.ok) {
    await writeStaffFlow({ cause: wardCause(result) });
    redirect(QUEUE);
  }

  await writeStaffFlow({
    notice: result.member.identityState === 'checked' ? 'RESIDENCE_CHECKED' : 'RESIDENCE_REJECTED',
  });
  redirect(QUEUE);
}
