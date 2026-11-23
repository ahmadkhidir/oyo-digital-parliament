/**
 * `GET /api/admin/data-requests` — the operator's data-request queue (`C-066`, `FEAT-012`,
 * `NFR-040`).
 *
 * Operator only. The answer carries the request type, state, dates, hold note and review date, outcome
 * reason and file reference — never a name, a telephone number or any other personal field. The
 * operator works each request through the Identity and Access Service.
 */
import type { NextRequest } from 'next/server';
import { identityFailure, readDataRequestQueue, toIsoSeconds } from '@odp/domain';
import { rateLimited } from '../../../../lib/http/rate-limit';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { readCorrelationId } from '../../../../lib/logging';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import { readStaffAccess, staffCaller } from '../../../../lib/staff-session/session';
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

/** Answers one page of the operator's queue. */
async function handleGet(request: NextRequest): Promise<Response> {
  const correlation = readCorrelationId(request.headers);
  const correlationId = correlation.correlationId;
  if (!correlation.ok) {
    return jsonQueueAnswer(
      queueValidationAnswer(
        correlationId,
        'CORRELATION_ID_INVALID',
        "The correlation identifier is not in the contract's form.",
        { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
      ),
      correlationId,
    );
  }

  const access = await readStaffAccess();

  if (access.kind === 'signed_out') {
    const failure = identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'Sign in to read the data request queue.',
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
  if (access.staff.role !== 'operator') {
    const failure = identityFailure(
      'FORBIDDEN_ROLE',
      'OPERATOR_REQUIRED',
      'The data request queue is worked by the operator.',
    );
    return jsonQueueAnswer(queueFailureAnswer(failure, correlationId), correlationId);
  }

  const url = request.nextUrl;
  const status = url.searchParams.get('status');
  if (status !== null && status !== '' && status !== 'open') {
    return jsonQueueAnswer(
      queueValidationAnswer(
        correlationId,
        'DATA_REQUEST_QUERY_INVALID',
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
        'DATA_REQUEST_QUERY_INVALID',
        'The page size is not a whole number.',
        { limit: 'OUT_OF_BAND' },
      ),
      correlationId,
    );
  }

  const dependencies = await getStaffAdminDependencies();
  const result = await readDataRequestQueue(
    staffCaller(access, await resolveLocale(), correlationId),
    { dataRequests: dependencies.dataRequests, clock: dependencies.identity.clock },
    {
      status: 'open',
      ...(url.searchParams.get('cursor') === null
        ? {}
        : { cursor: url.searchParams.get('cursor') ?? '' }),
      ...(limit === undefined ? {} : { limit }),
    },
  );

  if (!result.ok) {
    return jsonQueueAnswer(queueFailureAnswer(result, correlationId), correlationId);
  }

  return jsonQueueAnswer(
    queueReadAnswer({
      correlationId,
      asAt: toIsoSeconds(dependencies.platform.clock.now()),
      nextCursor: result.nextCursor,
      data: {
        requests: result.requests,
        openCount: result.openCount,
        overdueCount: result.overdueCount,
      },
    }),
    correlationId,
  );
}

/** Every answer carries the `C-001` rate-limit triple, a role refusal included. */
export const GET: (request: NextRequest) => Promise<Response> = rateLimited(handleGet);
