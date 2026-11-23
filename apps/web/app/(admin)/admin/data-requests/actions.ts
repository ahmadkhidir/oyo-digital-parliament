'use server';

/**
 * The data-request queue's one write (`C-067`, `screens/22-data-request-queue.md`).
 *
 * The screen's four controls post here with the action they name. The operator supplies a reason, the
 * hold note and review date when deferring, and nothing else: a completed export's file is produced by
 * the identity service through `C-070`, and the operator never handles it.
 */
import { redirect } from 'next/navigation';
import {
  resolveDataRequest,
  type DataRequestAction,
  type DataRequestPropagation,
  type IdentityFailure,
} from '@odp/domain';
import { resolveLocale } from '../../../../lib/i18n/locale';
import {
  actionRefusal,
  readActionRequest,
  type ActionFailureEnvelope,
} from '../../../../lib/http/rate-limit';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import { readStaffAccess, staffCaller } from '../../../../lib/staff-session/session';
import {
  analyticsDeletionFor,
  memberExportFor,
} from '../../../../lib/staff-session/deps';
import { writeStaffFlow, type StaffFlowCause } from '../../../../lib/staff-session/cookies';
import { newIdempotencyKey } from '../../../../lib/staff-session/request';

const QUEUE = '/admin/data-requests';

/** Reads one string field from the form. */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/**
 * Normalises the date control's local value to the `C-067` instant form.
 *
 * A `datetime-local` input sends `YYYY-MM-DDTHH:mm` with no seconds or zone. The queue records the
 * date the hold is next reviewed, so the control's minute precision is widened to the contract's
 * instant form. A value that already carries seconds is left alone; anything else is passed through
 * for the domain to refuse.
 */
function readReviewInstant(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return `${value}:00Z`;
  return value;
}

/** Maps a `C-067` refusal onto the flow cookie's stable cause. */
function dataRequestCause(failure: IdentityFailure): StaffFlowCause {
  switch (failure.cause) {
    case 'DATA_REQUEST_RESOLUTION_INVALID':
    case 'DATA_REQUEST_NOT_FOUND':
    case 'DATA_REQUEST_ALREADY_CLOSED':
    case 'LEGAL_HOLD':
    case 'EXPORT_GENERATION_FAILED':
    case 'DATA_REQUEST_QUEUE_UNAVAILABLE':
      return failure.cause;
    default:
      return 'DEGRADED';
  }
}

/**
 * Applies the submitted transition.
 *
 * `action` is `start`, `complete`, `defer` or `refuse`; every other value is refused by the domain and
 * rendered as an error. The success notice distinguishes a deletion completion, because its result is
 * different from every other completion.
 */
export async function resolveDataRequestAction(formData: FormData): Promise<void>;
export async function resolveDataRequestAction(
  formData: FormData,
): Promise<ActionFailureEnvelope | void> {
  const request = await readActionRequest();
  if (!request.correlation.ok) {
    return actionRefusal(request.correlation, request.rateLimit) ?? undefined;
  }

  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in?ended=1');
  if (access.kind === 'challenge') redirect('/staff/2fa');
  if (access.kind === 'degraded') {
    await writeStaffFlow({ cause: 'DEGRADED' });
    redirect(QUEUE);
  }
  if (access.staff.role !== 'operator') {
    await writeStaffFlow({ cause: 'DEGRADED' });
    redirect(QUEUE);
  }

  const dependencies = await getStaffAdminDependencies();
  const requestId = readField(formData, 'requestId');
  const action = readField(formData, 'action') as DataRequestAction;

  // The notice for a completion needs the request's type; the read is the operator's own queue read,
  // which never carries a personal field.
  let requestType: string | null = null;
  try {
    requestType = (await dependencies.dataRequests.findById(requestId))?.type ?? null;
  } catch {
    requestType = null;
  }

  const result = await resolveDataRequest(
    staffCaller(access, await resolveLocale()),
    {
      dataRequests: dependencies.dataRequests,
      members: dependencies.identity.members,
      memberContent: dependencies.identity.memberContent,
      legalHolds: dependencies.identity.legalHolds,
      exportMemberData: memberExportFor(dependencies),
      analyticsDeletion: analyticsDeletionFor(dependencies),
      audit: dependencies.identity.audit,
      analytics: dependencies.identity.analytics,
      idempotency: dependencies.identity.idempotency,
      clock: dependencies.identity.clock,
      identifiers: dependencies.identity.identifiers,
    },
    {
      requestId,
      action,
      outcomeReason: readField(formData, 'outcomeReason'),
      legalHoldNote: readField(formData, 'legalHoldNote'),
      legalHoldReviewAt: readReviewInstant(readField(formData, 'legalHoldReviewAt')),
      idempotencyKey: newIdempotencyKey(),
    },
  );

  if (!result.ok) {
    await writeStaffFlow({ cause: dataRequestCause(result) });
    redirect(QUEUE);
  }

  switch (action) {
    case 'start':
      await writeStaffFlow({ notice: 'REQUEST_STARTED' });
      break;
    case 'defer':
      await writeStaffFlow({ notice: 'REQUEST_DEFERRED' });
      break;
    case 'refuse':
      await writeStaffFlow({ notice: 'REQUEST_REFUSED' });
      break;
    case 'complete':
      await writeStaffFlow({
        notice: requestType === 'deletion' ? 'DELETION_COMPLETED' : 'REQUEST_COMPLETED',
      });
      break;
    default:
      await writeStaffFlow({ cause: 'DATA_REQUEST_RESOLUTION_INVALID' });
  }
  redirect(QUEUE);
}

/** Exported so a route or a page can name the propagation shape without a deep import. */
export type { DataRequestPropagation };
