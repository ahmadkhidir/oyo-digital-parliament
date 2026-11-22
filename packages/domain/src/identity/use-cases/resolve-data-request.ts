/**
 * Working one data request through the operator's queue (`C-067`, `FEAT-012`, `NFR-040`, `EVT-037`,
 * screen 22).
 *
 * One operator moves a request to `in_progress`, `completed`, `deferred_for_legal_hold` or `refused`.
 * A deferral records why and the date the hold is next reviewed; a refusal records why; a completed
 * export is produced by the Identity and Access Service and its object reference is recorded; a
 * completed deletion anonymises the member, leaves every submission in place marked as withdrawn by
 * the author and confirms the analytics replacement before it reports success (`C-090`).
 *
 * Every transition appends its audit event with the operator as actor, the request as target, the
 * action's stable verb, the instant and the operator's reason. A completion is the only transition
 * that emits `EVT-037`.
 */
import {
  identityFailure,
  type DataRequest,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
} from '../entities.ts';
import type { AuditAppendPort } from '../../audit/index.ts';
import type { ClockPort } from '../../ports/clock.ts';
import type { IdentifierPort } from '../../ports/identifiers.ts';
import { readIdempotencyKey, staffActionRefusal, toIsoSeconds } from '../policies.ts';
import type {
  AnalyticsDeletionPort,
  DataRequestResolutionPort,
  DataRequestTransitionInput,
  IdentityAnalyticsEvent,
  IdentityAnalyticsPort,
  IdentityPorts,
  LegalHoldPort,
  MemberContentPort,
  MemberExportPort,
  MemberPort,
} from '../ports.ts';
import {
  appendIdentityAudit,
  fingerprintOf,
  isRecord,
  lookupReplay,
  recordAnswer,
  reusedKeyFailure,
} from './support.ts';

/** The `C-067` action names. */
export const DATA_REQUEST_ACTIONS = ['start', 'complete', 'defer', 'refuse'] as const;
export type DataRequestAction = (typeof DATA_REQUEST_ACTIONS)[number];

/** The `C-067` request. `fileReference` is produced by the service for an export, never supplied. */
export interface ResolveDataRequestInput {
  readonly requestId: string;
  readonly action: DataRequestAction;
  readonly outcomeReason?: string | null;
  readonly legalHoldNote?: string | null;
  readonly legalHoldReviewAt?: string | null;
  readonly idempotencyKey?: string;
}

/** The propagation facts `C-067` prints after a transition. */
export interface DataRequestPropagation {
  readonly identityAnonymised: boolean;
  readonly analyticsTokenReplaced: boolean;
  readonly auditConfirmed: boolean;
  readonly heldSubmissionReference: string | null;
}

/** The transitioned request as the answer prints it: the member reference never leaves the service. */
export type ResolvedDataRequest = Omit<DataRequest, 'memberId'>;

/** The `C-067` answer, or the refusal that stopped the write. */
export type ResolveDataRequestResult =
  | {
      readonly ok: true;
      readonly dataRequest: ResolvedDataRequest;
      readonly propagation: DataRequestPropagation;
    }
  | IdentityFailure;

/** Everything one transition needs. */
export interface ResolveDataRequestDeps {
  readonly dataRequests: Pick<IdentityPorts['dataRequests'], 'findById'> &
    DataRequestResolutionPort;
  readonly members: Pick<MemberPort, 'anonymise'>;
  readonly memberContent: Pick<MemberContentPort, 'withdrawAuthoredSubmissions'>;
  readonly legalHolds: LegalHoldPort;
  readonly exportMemberData: MemberExportPort;
  readonly analyticsDeletion: AnalyticsDeletionPort;
  readonly audit: AuditAppendPort;
  readonly analytics: IdentityAnalyticsPort;
  readonly idempotency: IdentityPorts['idempotency'];
  readonly clock: ClockPort;
  readonly identifiers: IdentifierPort;
}

/** `C-067`: the field shape of the failure answer. */
const OUTCOME_REASON_MAX_LENGTH = 1000;
const LEGAL_HOLD_NOTE_MAX_LENGTH = 500;

/** The statuses the schema treats as final (`C-067`). */
const CLOSED_STATUSES: readonly DataRequest['status'][] = ['completed', 'refused'];

/** The `C-067` date-time form: an ISO instant the transport can render. */
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

/** Narrows a recorded answer back to this operation's shape. */
function isResolved(value: unknown): value is Extract<ResolveDataRequestResult, { ok: true }> {
  return isRecord(value) && value['ok'] === true && isRecord(value['dataRequest']);
}

/** The refusal an unauthenticated or wrong-role caller receives. */
function callerRefusal(caller: IdentityCaller): IdentityFailure | null {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'STAFF_SESSION_REQUIRED',
      'Sign in to work the data request queue.',
      {},
      { meta: { recoveryPath: '/staff/sign-in' } },
    );
  }
  if (caller.kind === 'member') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_PRESENT',
      'A resident session cannot work a data request.',
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

/** Whether an action is one `C-067` names. */
function isAction(value: unknown): value is DataRequestAction {
  return typeof value === 'string' && (DATA_REQUEST_ACTIONS as readonly string[]).includes(value);
}

/** A trimmed, non-empty reading of one optional text field. */
function readText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** The days between a request's recording and its completion, never negative. */
function daysToComplete(requestedAt: string, completedAt: string): number {
  const elapsed = Date.parse(completedAt) - Date.parse(requestedAt);
  return elapsed <= 0 ? 0 : Math.floor(elapsed / 86_400_000);
}

/**
 * Applies one operator transition.
 *
 * @param caller - The operator's satisfied staff session.
 * @param deps - The request, identity, export, analytics, audit and replay stores.
 * @param input - The request, the action and the fields that action requires.
 */
export async function resolveDataRequest(
  caller: IdentityCaller,
  deps: ResolveDataRequestDeps,
  input: ResolveDataRequestInput,
): Promise<ResolveDataRequestResult> {
  const refused = callerRefusal(caller);
  if (refused !== null) return refused;
  if (caller.kind !== 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'OPERATOR_REQUIRED',
      'The data request queue is worked by the operator.',
    );
  }

  const fields: Record<string, IdentityFieldReason> = {};
  if (typeof input.requestId !== 'string' || input.requestId === '') {
    fields['requestId'] = 'REQUIRED';
  }
  if (!isAction(input.action)) {
    fields['action'] = input.action === undefined ? 'REQUIRED' : 'ENUM_MISMATCH';
  }
  const outcomeReason = readText(input.outcomeReason);
  const legalHoldNote = readText(input.legalHoldNote);
  const legalHoldReviewAt = readText(input.legalHoldReviewAt);
  if (outcomeReason !== null && outcomeReason.length > OUTCOME_REASON_MAX_LENGTH) {
    fields['outcomeReason'] = 'TOO_LONG';
  }
  if (legalHoldNote !== null && legalHoldNote.length > LEGAL_HOLD_NOTE_MAX_LENGTH) {
    fields['legalHoldNote'] = 'TOO_LONG';
  }
  if (legalHoldReviewAt !== null && !DATE_TIME_PATTERN.test(legalHoldReviewAt)) {
    fields['legalHoldReviewAt'] = 'PATTERN_MISMATCH';
  }

  if (input.action === 'defer') {
    if (outcomeReason === null) fields['outcomeReason'] = 'REQUIRED';
    if (legalHoldNote === null) fields['legalHoldNote'] = 'REQUIRED';
    if (legalHoldReviewAt === null) fields['legalHoldReviewAt'] = 'REQUIRED';
  }
  if (input.action === 'refuse' && outcomeReason === null) {
    fields['outcomeReason'] = 'REQUIRED';
  }

  const key = readIdempotencyKey(input.idempotencyKey);
  if (!key.ok) fields[key.field] = key.reason;
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'DATA_REQUEST_RESOLUTION_INVALID',
      'The transition needs an action, and the fields that action states.',
      fields,
    );
  }
  if (!isAction(input.action) || !key.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'DATA_REQUEST_RESOLUTION_INVALID',
      'The transition could not be read.',
    );
  }

  let request: DataRequest | null;
  try {
    request = await deps.dataRequests.findById(input.requestId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'DATA_REQUEST_STORE_UNAVAILABLE',
      'The request could not be read, so nothing was changed.',
    );
  }
  if (request === null) {
    return identityFailure('NOT_FOUND', 'DATA_REQUEST_NOT_FOUND', 'That request is not in the queue.');
  }
  if (CLOSED_STATUSES.includes(request.status)) {
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'DATA_REQUEST_ALREADY_CLOSED',
      'This request is already closed and cannot move again.',
    );
  }

  if (input.action === 'complete' && request.type === 'deletion' && outcomeReason === null) {
    return identityFailure(
      'VALIDATION_FAILED',
      'DATA_REQUEST_RESOLUTION_INVALID',
      'A deletion completion states why the record was removed.',
      { outcomeReason: 'REQUIRED' },
    );
  }

  const fingerprint = fingerprintOf([
    input.requestId,
    input.action,
    outcomeReason,
    legalHoldNote,
    legalHoldReviewAt,
  ]);
  const replay = await lookupReplay(deps, key.value, fingerprint, isResolved);
  if (replay.kind === 'mismatch') return reusedKeyFailure();
  if (replay.kind === 'replay') return replay.result;

  const now = toIsoSeconds(deps.clock.now());
  let transition: DataRequestTransitionInput;
  let actionVerb: string;
  let auditReason: string;
  let identityAnonymised = false;
  let analyticsTokenReplaced = false;
  let heldSubmissionReference: string | null = null;

  switch (input.action) {
    case 'start': {
      transition = { status: 'in_progress', at: now, completedById: caller.staffId };
      actionVerb = 'data_request.started';
      auditReason = 'OPERATOR_STARTED';
      break;
    }
    case 'defer': {
      // The three fields are non-null after the validation above; the narrowing is explicit so the
      // type matches the store's conditional write.
      transition = {
        status: 'deferred_for_legal_hold',
        at: now,
        completedById: caller.staffId,
        ...(outcomeReason === null ? {} : { outcomeReason }),
        ...(legalHoldNote === null ? {} : { legalHoldNote }),
        ...(legalHoldReviewAt === null ? {} : { legalHoldReviewAt }),
      };
      actionVerb = 'data_request.deferred';
      auditReason = 'LEGAL_HOLD_RECORDED';
      break;
    }
    case 'refuse': {
      transition = {
        status: 'refused',
        at: now,
        completedById: caller.staffId,
        ...(outcomeReason === null ? {} : { outcomeReason }),
      };
      actionVerb = 'data_request.refused';
      auditReason = outcomeReason ?? 'REQUEST_REFUSED';
      break;
    }
    case 'complete': {
      if (request.type === 'export') {
        // `C-067` as corrected by the issue ruling: the operator supplies no file. The identity
        // service produces the export and answers with the object reference the row records.
        let produced: Awaited<ReturnType<MemberExportPort['exportMemberData']>>;
        try {
          produced = await deps.exportMemberData.exportMemberData({
            memberId: request.memberId,
            requestId: request.id,
            at: now,
          });
        } catch {
          return identityFailure(
            'SERVICE_DEGRADED',
            'EXPORT_GENERATION_FAILED',
            'The export could not be produced, so the request stays open.',
          );
        }
        transition = {
          status: 'completed',
          at: now,
          completedById: caller.staffId,
          fileReference: produced.objectReference,
          ...(outcomeReason === null ? {} : { outcomeReason }),
        };
        actionVerb = 'data_request.completed';
        auditReason = 'EXPORT_PRODUCED';
        break;
      }

      if (request.type === 'deletion') {
        let hold: { readonly reviewDate: string } | null;
        try {
          hold = await deps.legalHolds.findOpenForMember(request.memberId);
        } catch {
          return identityFailure(
            'SERVICE_DEGRADED',
            'LEGAL_HOLD_CHECK_UNAVAILABLE',
            'The record could not be checked for a legal hold, so nothing was removed.',
          );
        }
        if (hold !== null) {
          heldSubmissionReference = null;
          return identityFailure(
            'LEGAL_HOLD',
            'DELETION_DEFERRED',
            'Part of this record is under legal review; defer the request and record the review date.',
            {},
            { meta: { reviewDate: hold.reviewDate } },
          );
        }

        try {
          await deps.members.anonymise(request.memberId, now);
          await deps.memberContent.withdrawAuthoredSubmissions(request.memberId, now);
        } catch {
          return identityFailure(
            'SERVICE_DEGRADED',
            'IDENTITY_STORE_UNAVAILABLE',
            'The record could not be deleted, so the request stays open.',
          );
        }
        identityAnonymised = true;

        try {
          await deps.analyticsDeletion.replaceSubject(request.memberId);
          analyticsTokenReplaced = true;
        } catch {
          return identityFailure(
            'SERVICE_DEGRADED',
            'ANALYTICS_STORE_UNAVAILABLE',
            'The analytics store did not confirm the deletion, so the request is not complete.',
          );
        }

        transition = {
          status: 'completed',
          at: now,
          completedById: caller.staffId,
          ...(outcomeReason === null ? {} : { outcomeReason }),
        };
        actionVerb = 'data_request.completed';
        auditReason = outcomeReason ?? 'DELETION_COMPLETED';
        break;
      }

      transition = {
        status: 'completed',
        at: now,
        completedById: caller.staffId,
        ...(outcomeReason === null ? {} : { outcomeReason }),
      };
      actionVerb = 'data_request.completed';
      auditReason = OUTCOME_COMPLETE_REASON[request.type];
      break;
    }
    default: {
      return identityFailure(
        'VALIDATION_FAILED',
        'DATA_REQUEST_RESOLUTION_INVALID',
        'The transition could not be read.',
        { action: 'ENUM_MISMATCH' },
      );
    }
  }

  let updated: DataRequest | null;
  try {
    updated = await deps.dataRequests.transition(request.id, transition);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'DATA_REQUEST_STORE_UNAVAILABLE',
      'The request could not be moved, so nothing was changed.',
    );
  }
  if (updated === null) {
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'DATA_REQUEST_ALREADY_CLOSED',
      'This request was closed by another operator.',
    );
  }

  const refusedAudit = await appendIdentityAudit(deps, {
    actorId: caller.staffId,
    actorRole: 'operator',
    action: actionVerb,
    entityType: 'DataRequest',
    entityId: updated.id,
    reason: auditReason,
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refusedAudit !== null) return refusedAudit;

  if (input.action === 'complete') {
    const events: IdentityAnalyticsEvent[] = [
      {
        name: 'data_request_completed',
        properties: {
          request_type: updated.type,
          days_to_complete: daysToComplete(updated.requestedAt, now),
        },
        subject: { kind: 'member', memberId: updated.memberId },
      },
    ];
    for (const event of events) {
      try {
        await deps.analytics.emit(event);
      } catch {
        // `C-089`: a lost product event never undoes the completion it describes.
      }
    }
  }

  const result: Extract<ResolveDataRequestResult, { ok: true }> = {
    ok: true,
    dataRequest: {
      id: updated.id,
      type: updated.type,
      status: updated.status,
      ...(updated.legalHoldNote === undefined ? {} : { legalHoldNote: updated.legalHoldNote }),
      ...(updated.legalHoldReviewAt === undefined
        ? {}
        : { legalHoldReviewAt: updated.legalHoldReviewAt }),
      ...(updated.outcomeReason === undefined ? {} : { outcomeReason: updated.outcomeReason }),
      ...(updated.fileReference === undefined ? {} : { fileReference: updated.fileReference }),
      ...(updated.completedById === undefined ? {} : { completedById: updated.completedById }),
      requestedAt: updated.requestedAt,
      ...(updated.completedAt === undefined ? {} : { completedAt: updated.completedAt }),
    },
    propagation: {
      identityAnonymised,
      analyticsTokenReplaced,
      auditConfirmed: true,
      heldSubmissionReference,
    },
  };
  await recordAnswer(deps, key.value, fingerprint, result);
  return result;
}

/** The stable audit reason for a completion that records no operator sentence. */
const OUTCOME_COMPLETE_REASON: Readonly<Record<DataRequest['type'], string>> = {
  access: 'ACCESS_DELIVERED',
  correction: 'CORRECTION_APPLIED',
  export: 'EXPORT_PRODUCED',
  deletion: 'DELETION_COMPLETED',
};
