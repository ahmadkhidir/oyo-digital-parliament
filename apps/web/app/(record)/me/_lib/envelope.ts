/**
 * The `C-032` and `C-036` answers, in the `C-001` envelope (`NFR-040`, `screens/13-my-record.md`).
 *
 * The route handlers own transport only: they resolve the session cookie, hand the caller to the
 * domain use case and print what it answered. The mapping lives here so every state — the full
 * record, an unauthenticated caller, a degraded identity store and a deferred export — can be
 * exercised without a request, and so the two handlers cannot drift apart in their failure shape.
 *
 * The body carries exactly what `C-032` prints. `heldItems` carries the reference and the
 * member-facing reason, never the held text; a data request carries its hold note and review date
 * as `null` unless it is deferred (`CONTRACTS.md` 1.6.0).
 */
import type {
  IdentityFailure,
  IdentityFailureCode,
  MyRecord,
  ReadMyRecordResult,
} from '@odp/domain';

/** The HTTP status `C-001` fixes for each refusal these handlers can produce. */
const FAILURE_STATUS: Readonly<Record<IdentityFailureCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  NOT_FOUND: 404,
  CONFLICT_ALREADY_DECIDED: 409,
  POLICY_VIOLATION: 422,
  LEGAL_HOLD: 423,
  RATE_LIMITED: 429,
  WRITE_QUEUED: 503,
  SERVICE_DEGRADED: 503,
};

/** The `C-001` error body. */
export interface RecordErrorBody {
  readonly error: {
    readonly code: IdentityFailureCode;
    readonly cause: string;
    readonly message: string;
    readonly correlationId: string;
    readonly fields?: Readonly<Record<string, string>>;
    readonly retryAfterSeconds?: number;
    readonly meta?: IdentityFailure['meta'];
  };
}

/** One answer a member route handler returns. */
export type RecordAnswer =
  | {
      readonly status: 200;
      readonly body: {
        readonly data: { readonly [key: string]: unknown };
        readonly meta: {
          readonly correlationId: string;
          readonly asAt: string;
          readonly degraded: false;
        };
        readonly page?: { readonly nextCursor: string | null; readonly hasMore: boolean };
      };
    }
  | { readonly status: number; readonly body: RecordErrorBody };

/**
 * The `C-032` data body, member projection included.
 *
 * This is the only wire shape carrying `fullName`, `telephoneNumber` and `declaredAge`, and the
 * use case has already restricted it to the session's own member.
 */
export function myRecordData(record: MyRecord): { readonly [key: string]: unknown } {
  return {
    member: record.member,
    consents: record.consents,
    submissions: record.submissions,
    heldBackings: record.heldBackings,
    dataRequests: record.dataRequests.map((request) => ({
      id: request.id,
      type: request.type,
      status: request.status,
      requestedAt: request.requestedAt,
      fileReference: request.fileReference ?? null,
      legalHoldNote: request.legalHoldNote,
      legalHoldReviewAt: request.legalHoldReviewAt,
    })),
    heldItems: record.heldItems,
  };
}

/**
 * Turns the `C-032` answer into the envelope.
 *
 * @param result - The use case's answer, refusal included.
 * @param meta - The request's correlation identifier and the instant the answer was computed.
 */
export function myRecordAnswer(
  result: ReadMyRecordResult,
  meta: { readonly correlationId: string; readonly asAt: string },
): RecordAnswer {
  if (!result.ok) return failureAnswer(result, meta.correlationId);
  return {
    status: 200,
    body: {
      data: myRecordData(result.record),
      meta: { ...meta, degraded: false },
      page: {
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      },
    },
  };
}

/** Turns a domain refusal into the `C-001` failure envelope and its status. */
export function failureAnswer(failure: IdentityFailure, correlationId: string): RecordAnswer {
  return {
    status: FAILURE_STATUS[failure.code],
    body: {
      error: {
        code: failure.code,
        cause: failure.cause,
        message: failure.message,
        correlationId,
        ...(Object.keys(failure.fields).length === 0 ? {} : { fields: failure.fields }),
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
        ...(failure.meta === undefined ? {} : { meta: failure.meta }),
      },
    },
  };
}

/** A refusal raised at the boundary, in the same error envelope the domain's refusals use. */
export function validationAnswer(
  correlationId: string,
  cause: string,
  message: string,
  fields: Readonly<Record<string, string>>,
): RecordAnswer {
  return {
    status: 400,
    body: {
      error: {
        code: 'VALIDATION_FAILED',
        cause,
        message,
        correlationId,
        fields,
      },
    },
  };
}

/** Answers with one envelope and the transport headers the member routes share. */
export function jsonAnswer(answer: RecordAnswer, correlationId: string): Response {
  return Response.json(answer.body, {
    status: answer.status,
    headers: {
      // A member's own record is never a shared cache entry.
      'Cache-Control': 'no-store',
      'X-Correlation-Id': correlationId,
    },
  });
}
