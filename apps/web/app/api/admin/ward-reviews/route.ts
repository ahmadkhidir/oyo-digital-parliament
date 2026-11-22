/**
 * `GET /api/admin/ward-reviews` — the ward description review queue (`C-055`, `FEAT-002`).
 *
 * Response-staff only. The handler reads the query, resolves the staff session, hands the caller to
 * the domain and prints the `C-001` envelope. It never assigns a ward and never strips the resident's
 * words: the description is the reviewer's evidence.
 */
import type { NextRequest } from 'next/server';
import { identityFailure, readWardReviewQueue, toIsoSeconds, type WardCaller } from '@odp/domain';
import { correlationIdFrom } from '../../../../lib/logging';
import { readWardReviewPorts } from '../../../../lib/staff-session/deps';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import { readStaffAccess } from '../../../../lib/staff-session/session';
import {
  jsonQueueAnswer,
  queueFailureAnswer,
  queueReadAnswer,
  queueValidationAnswer,
} from '../../../../lib/staff-session/envelope';

export const dynamic = 'force-dynamic';

/** Reads a numeric page size from the query, or `undefined` when absent. */
function readLimit(value: string | null): number | undefined {
  if (value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

/** Answers one page of the review queue. */
export async function GET(request: NextRequest): Promise<Response> {
  const correlationId = correlationIdFrom(request.headers);
  const access = await readStaffAccess();

  if (access.kind === 'signed_out') {
    const failure = identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'Sign in to read the ward review queue.',
      {},
      { meta: { recoveryPath: '/staff/sign-in' } },
    );
    return jsonQueueAnswer(queueFailureAnswer(failure, correlationId), correlationId);
  }
  if (access.kind === 'degraded') {
    const failure = identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The session could not be read, so the queue cannot be shown.',
    );
    return jsonQueueAnswer(queueFailureAnswer(failure, correlationId), correlationId);
  }
  if (access.kind === 'challenge') {
    const failure = identityFailure(
      'UNAUTHENTICATED',
      'SECOND_FACTOR_REQUIRED',
      'Confirm your second factor before reading the queue.',
      {},
      { meta: { recoveryPath: '/staff/2fa' } },
    );
    return jsonQueueAnswer(queueFailureAnswer(failure, correlationId), correlationId);
  }
  if (access.staff.role !== 'response_staff') {
    const failure = identityFailure(
      'FORBIDDEN_ROLE',
      'WARD_REVIEWER_REQUIRED',
      'The ward review queue is read by response staff.',
    );
    return jsonQueueAnswer(queueFailureAnswer(failure, correlationId), correlationId);
  }

  const url = request.nextUrl;
  const status = url.searchParams.get('status') ?? 'queued';
  if (status !== 'queued' && status !== 'resolved' && status !== 'rejected') {
    return jsonQueueAnswer(
      queueValidationAnswer(
        correlationId,
        'WARD_REVIEW_QUERY_INVALID',
        'That status is not one the queue accepts.',
        { status: 'ENUM_MISMATCH' },
      ),
      correlationId,
    );
  }

  const limit = readLimit(url.searchParams.get('limit'));
  if (limit !== undefined && !Number.isInteger(limit)) {
    return jsonQueueAnswer(
      queueValidationAnswer(
        correlationId,
        'WARD_REVIEW_QUERY_INVALID',
        'The page size is not a whole number.',
        { limit: 'OUT_OF_BAND' },
      ),
      correlationId,
    );
  }

  const dependencies = await getStaffAdminDependencies();
  const caller: WardCaller = {
    kind: 'staff',
    staffId: access.staff.id,
    role: 'response_staff',
    correlationId,
  };
  const result = await readWardReviewQueue(caller, readWardReviewPorts(dependencies.database), {
    status,
    ...(url.searchParams.get('localGovernmentArea') === null
      ? {}
      : { localGovernmentArea: url.searchParams.get('localGovernmentArea') ?? '' }),
    ...(url.searchParams.get('cursor') === null
      ? {}
      : { cursor: url.searchParams.get('cursor') ?? '' }),
    ...(limit === undefined ? {} : { limit }),
  });

  if (!result.ok) {
    return jsonQueueAnswer(queueFailureAnswer(result, correlationId), correlationId);
  }

  return jsonQueueAnswer(
    queueReadAnswer({
      correlationId,
      asAt: toIsoSeconds(dependencies.platform.clock.now()),
      nextCursor: result.nextCursor,
      data: {
        reviews: result.reviews.map((entry) => ({
          id: entry.review.id,
          description: entry.review.description,
          localGovernmentArea: entry.review.localGovernmentArea ?? null,
          status: entry.review.status,
          memberIdentityState: entry.member?.identityState ?? null,
          memberWardStatus: entry.member?.wardStatus ?? null,
          memberDeleted: entry.member?.deleted ?? true,
          submissionReferences: entry.submissionReferences,
          createdAt: entry.review.createdAt,
        })),
        queuedCount: result.queuedCount,
        candidateWards: result.candidateWards,
      },
    }),
    correlationId,
  );
}
