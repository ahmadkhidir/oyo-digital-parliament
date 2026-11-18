/**
 * Creating a data request (`C-035`, `FEAT-012`, `NFR-040`, `EVT-036`).
 *
 * Records what the member asked for and nothing else: the request is worked in the operator's queue.
 * A deletion request against a record under legal hold is still created and is flagged, so the member
 * is told there is a hold rather than being silently refused. When the primary store cannot take the
 * write it is durably queued and the answer says so (`C-001`, `WRITE_QUEUED`).
 */
import {
  identityFailure,
  type DataRequest,
  type DataRequestType,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type MemberRecord,
} from '../entities.ts';
import { dataRequestDueAt, readDataRequestType, toIsoSeconds } from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import { appendIdentityAudit, consumeRateLimit, emitIdentityAnalytics } from './support.ts';

/** The `C-035` request. `note` is accepted by the shape and has no column in `schema.md`. */
export interface CreateDataRequestInput {
  readonly type: DataRequestType;
  readonly note?: string | null;
  /** The transport's `Idempotency-Key`, retained on the queued write (`C-001`). */
  readonly idempotencyKey?: string;
}

/** The committed `C-035` answer. */
export interface DataRequestCreated {
  readonly ok: true;
  readonly queued: false;
  readonly dataRequest: {
    readonly id: string;
    readonly memberId: string;
    readonly type: DataRequestType;
    readonly status: 'received';
    readonly requestedAt: string;
  };
  readonly dueAt: string;
  readonly legalHoldDetected: boolean;
}

/** The `WRITE_QUEUED` answer: the store refused, the queue accepted (`C-001`). */
export interface DataRequestQueued {
  readonly ok: true;
  readonly queued: true;
  readonly queuedWriteId: string;
  readonly acceptedAt: string;
  readonly replayBy: string;
  readonly durable: true;
}

/** The `C-035` answer, or the refusal that stopped it. */
export type CreateDataRequestResult = DataRequestCreated | DataRequestQueued | IdentityFailure;

/**
 * Records one data request for the caller.
 *
 * @param caller - The member making the request.
 * @param deps - The data-request, member, legal-hold, queue, audit and analytics ports.
 * @param input - The request type and the request shape's unused note field.
 */
export async function createDataRequest(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: CreateDataRequestInput,
): Promise<CreateDataRequestResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Sign in to make a data request.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'A staff session cannot make a request on a member’s behalf.',
    );
  }

  const type = readDataRequestType(input.type);
  const fields: Record<string, IdentityFieldReason> = {};
  if (!type.ok) fields[type.field] = type.reason;
  // `schema.md` DataRequest has no note column, so free text has nowhere honest to go.
  if (input.note !== undefined && input.note !== null && String(input.note).trim().length > 0) {
    fields['note'] = 'UNKNOWN_FIELD';
  }
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'DATA_REQUEST_INVALID',
      'Choose what you would like us to do with your data.',
      fields,
    );
  }
  if (!type.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'DATA_REQUEST_INVALID',
      'Choose what you would like us to do with your data.',
    );
  }

  let member: MemberRecord | null;
  try {
    member = await deps.members.get(caller.memberId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your account could not be read, so nothing was recorded.',
    );
  }
  if (member === null || member.deletedAt !== undefined) {
    return identityFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account is no longer available.');
  }

  const now = toIsoSeconds(deps.clock.now());

  const limited = await consumeRateLimit(deps, {
    bucket: 'data_request',
    subject: { kind: 'member', value: member.id },
  });
  if (!limited.ok) {
    return identityFailure(
      'SERVICE_DEGRADED',
      'RATE_LIMIT_UNAVAILABLE',
      'The request could not be checked. Try again in a moment.',
    );
  }
  if (!limited.allowed) {
    return identityFailure(
      'RATE_LIMITED',
      'DATA_REQUEST_LIMITED',
      'You have made several requests recently. Try again later.',
      {},
      { retryAfterSeconds: limited.retryAfterSeconds },
    );
  }

  if (type.value === 'export') {
    let open: DataRequest | null;
    try {
      open = await deps.dataRequests.findOpenExport(member.id);
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'IDENTITY_STORE_UNAVAILABLE',
        'Your requests could not be read, so nothing was recorded.',
      );
    }
    if (open !== null) {
      return identityFailure(
        'CONFLICT_ALREADY_DECIDED',
        'DUPLICATE_EXPORT_REQUEST',
        'An export is already being prepared. We will tell you when it is ready.',
        {},
        { meta: { existingDataRequestId: open.id } },
      );
    }
  }

  let legalHoldDetected = false;
  try {
    legalHoldDetected = (await deps.legalHolds.findOpenForMember(member.id)) !== null;
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your record could not be checked for a legal hold, so nothing was recorded.',
    );
  }

  const request: DataRequest = {
    id: deps.identifiers.next('drq'),
    memberId: member.id,
    type: type.value,
    status: 'received',
    requestedAt: now,
  };

  try {
    await deps.dataRequests.create(request);
  } catch {
    return queueRequest(deps, request, caller, input.idempotencyKey);
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: member.id,
    actorRole: 'member',
    action: 'data_request.created',
    entityType: 'DataRequest',
    entityId: request.id,
    reason: type.value.toUpperCase(),
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  await emitIdentityAnalytics(deps, [
    {
      name: 'data_request_created',
      properties: { request_type: type.value },
      // `EVT-036`, `C-089`: the request belongs to the signed-in member who filed it.
      subject: { kind: 'member', memberId: member.id },
      locale: member.locale,
    },
  ]);

  return {
    ok: true,
    queued: false,
    dataRequest: {
      id: request.id,
      memberId: request.memberId,
      type: request.type,
      status: 'received',
      requestedAt: request.requestedAt,
    },
    dueAt: dataRequestDueAt(request.type, request.requestedAt),
    legalHoldDetected,
  };
}

/**
 * Durably queues a request the primary store refused.
 *
 * The queue entry carries identifiers and closed tokens only; the member's name, number and words never
 * enter it (`C-001`, `AGENTS.md` Boundaries). The audit record is appended at replay, not now.
 */
async function queueRequest(
  deps: IdentityPorts,
  request: DataRequest,
  caller: Extract<IdentityCaller, { kind: 'member' }>,
  idempotencyKey: string | undefined,
): Promise<CreateDataRequestResult> {
  try {
    const queued = await deps.queuedWrites.enqueue({
      kind: 'data_request.create',
      idempotencyKey: idempotencyKey ?? `drq_${request.id}`,
      at: request.requestedAt,
      payload: {
        requestId: request.id,
        memberId: request.memberId,
        type: request.type,
        correlationId: caller.correlationId ?? '',
      },
    });
    return {
      ok: true,
      queued: true,
      queuedWriteId: queued.queuedWriteId,
      acceptedAt: queued.acceptedAt,
      replayBy: queued.replayBy,
      durable: true,
    };
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your request could not be recorded. Try again in a moment.',
    );
  }
}
