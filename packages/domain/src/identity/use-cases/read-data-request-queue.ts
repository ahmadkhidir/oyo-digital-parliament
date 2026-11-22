/**
 * Reading the operator's data-request queue (`C-066`, `FEAT-012`, `NFR-040`, screen 22).
 *
 * The operator works rights requests in statutory-deadline order and sees the request type, its
 * state, any legal-hold note and review date, the outcome reason and the file reference — and nothing
 * about the person behind it. `C-066` is explicit that no name, telephone number or other personal
 * data is returned: the operator works each request through the Identity and Access Service, which
 * is a different surface.
 *
 * The overdue flag and the two counts are derived at read time from `requestedAt`, the request type's
 * statutory window and the injected clock (`C-035`). Nothing stores an overdue marker.
 */
import {
  identityFailure,
  type DataRequest,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
} from '../entities.ts';
import { dataRequestDueAt, readRecordPageLimit, staffActionRefusal } from '../policies.ts';
import type { DataRequestQueuePort } from '../ports.ts';

/** The `C-066` query. The screen opens on the open requests. */
export interface ReadDataRequestQueueInput {
  readonly status?: 'open';
  readonly cursor?: string;
  readonly limit?: number;
}

/** One request as the queue prints it: no member identifier, no personal data. */
export interface QueuedDataRequest {
  readonly id: string;
  readonly type: DataRequest['type'];
  readonly status: DataRequest['status'];
  readonly requestedAt: string;
  readonly dueAt: string;
  readonly overdue: boolean;
  readonly legalHoldNote: string | null;
  readonly legalHoldReviewAt: string | null;
  readonly outcomeReason: string | null;
  readonly fileReference: string | null;
}

/** The `C-066` answer, or the refusal that stopped the read. */
export type ReadDataRequestQueueResult =
  | {
      readonly ok: true;
      readonly requests: readonly QueuedDataRequest[];
      readonly openCount: number;
      readonly overdueCount: number;
      readonly nextCursor: string | null;
    }
  | IdentityFailure;

/** What the read needs: the queue store and the clock the overdue state is derived from. */
export interface DataRequestQueueDeps {
  readonly dataRequests: DataRequestQueuePort;
  readonly clock: { now(): Date };
}

/** The statuses `C-066` treats as open: everything not completed or refused. */
function isOpen(request: DataRequest): boolean {
  return request.status !== 'completed' && request.status !== 'refused';
}

/** Maps a stored request to the queue row, deriving the deadline and its overdue state. */
function toQueued(request: DataRequest, now: string): QueuedDataRequest {
  const dueAt = dataRequestDueAt(request.type, request.requestedAt);
  return {
    id: request.id,
    type: request.type,
    status: request.status,
    requestedAt: request.requestedAt,
    dueAt,
    overdue: Date.parse(dueAt) < Date.parse(now),
    legalHoldNote: request.legalHoldNote ?? null,
    legalHoldReviewAt: request.legalHoldReviewAt ?? null,
    outcomeReason: request.outcomeReason ?? null,
    fileReference: request.fileReference ?? null,
  };
}

/** The refusal an unauthenticated or wrong-role caller receives. */
function callerRefusal(caller: IdentityCaller): IdentityFailure | null {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'Sign in to read the data request queue.',
      {},
      { meta: { recoveryPath: '/staff/sign-in' } },
    );
  }
  if (caller.kind === 'member') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_PRESENT',
      'A resident session cannot reach the operator queue.',
    );
  }
  if (caller.role !== 'operator') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'OPERATOR_REQUIRED',
      'The data request queue is worked by the operator.',
    );
  }
  return staffActionRefusal(caller);
}

/**
 * Reads one page of the operator's queue.
 *
 * @param caller - The operator's satisfied staff session.
 * @param deps - The request store and the clock.
 * @param input - The status, cursor and page size.
 */
export async function readDataRequestQueue(
  caller: IdentityCaller,
  deps: DataRequestQueueDeps,
  input: ReadDataRequestQueueInput = {},
): Promise<ReadDataRequestQueueResult> {
  const refused = callerRefusal(caller);
  if (refused !== null) return refused;

  const fields: Record<string, IdentityFieldReason> = {};
  if (input.status !== undefined && input.status !== 'open') {
    fields['status'] = 'ENUM_MISMATCH';
  }
  const limit = readRecordPageLimit(input.limit);
  if (!limit.ok) fields[limit.field] = limit.reason;
  if (input.cursor !== undefined && typeof input.cursor !== 'string') {
    fields['cursor'] = 'PATTERN_MISMATCH';
  }
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'DATA_REQUEST_QUERY_INVALID',
      'The queue query carries an unusable filter or page size.',
      fields,
    );
  }
  if (!limit.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'DATA_REQUEST_QUERY_INVALID',
      'The queue query is invalid.',
    );
  }

  const now = deps.clock.now().toISOString().replace(/\.\d{3}Z$/, 'Z');
  let page: Awaited<ReturnType<DataRequestQueuePort['listQueue']>>;
  try {
    page = await deps.dataRequests.listQueue({
      status: input.status ?? 'open',
      ...(typeof input.cursor === 'string' && input.cursor !== ''
        ? { cursor: input.cursor }
        : {}),
      limit: limit.value,
    });
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'DATA_REQUEST_QUEUE_UNAVAILABLE',
      'The queue could not be read; the last successful queue stands.',
    );
  }

  let open: readonly DataRequest[];
  try {
    open = await deps.dataRequests.listOpen();
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'DATA_REQUEST_QUEUE_UNAVAILABLE',
      'The queue could not be counted; the last successful queue stands.',
    );
  }

  const overdueCount = open.filter((request) => Date.parse(dataRequestDueAt(request.type, request.requestedAt)) < Date.parse(now)).length;

  return {
    ok: true,
    requests: page.requests.map((request) => toQueued(request, now)),
    openCount: open.filter(isOpen).length,
    overdueCount,
    nextCursor: page.nextCursor,
  };
}
