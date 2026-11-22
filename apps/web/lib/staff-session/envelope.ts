/**
 * The `C-001` envelope for the two admin read handlers (`C-055`, `C-066`).
 *
 * The route handlers own transport only: they resolve the staff session, hand the caller to the
 * domain use case and print what it answered. One module keeps the body, the status and the headers
 * identical between them, so the queue pages cannot disagree about how a refusal looks.
 */
import type {
  IdentityFailure,
  IdentityFailureCode,
  WardFailure,
  WardFailureCode,
} from '@odp/domain';

/** A refusal from either queue's domain. */
type QueueFailure = IdentityFailure | WardFailure;
type QueueFailureCode = IdentityFailureCode | WardFailureCode;

/** The HTTP status `C-001` fixes for each refusal code. */
const FAILURE_STATUS: Readonly<Record<QueueFailureCode, number>> = {
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
export interface QueueErrorBody {
  readonly error: {
    readonly code: QueueFailureCode;
    readonly cause: string;
    readonly message: string;
    readonly correlationId: string;
    readonly fields?: Readonly<Record<string, string>>;
    readonly retryAfterSeconds?: number;
    readonly meta?: IdentityFailure['meta'];
  };
}

/** One answer an admin read handler returns. */
export type QueueAnswer =
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
  | { readonly status: number; readonly body: QueueErrorBody };

/** Turns a domain refusal into the error envelope and its status. */
export function queueFailureAnswer(failure: QueueFailure, correlationId: string): QueueAnswer {
  const status = FAILURE_STATUS[failure.code as QueueFailureCode] ?? 503;
  return {
    status,
    body: {
      error: {
        code: failure.code,
        cause: failure.cause,
        message: failure.message,
        correlationId,
        ...(Object.keys(failure.fields).length === 0 ? {} : { fields: failure.fields }),
        ...('retryAfterSeconds' in failure && failure.retryAfterSeconds !== undefined
          ? { retryAfterSeconds: failure.retryAfterSeconds }
          : {}),
        ...('meta' in failure && failure.meta !== undefined ? { meta: failure.meta } : {}),
      },
    },
  };
}

/** Builds a successful read answer. */
export function queueReadAnswer(input: {
  readonly data: { readonly [key: string]: unknown };
  readonly correlationId: string;
  readonly asAt: string;
  readonly nextCursor: string | null;
}): QueueAnswer {
  return {
    status: 200,
    body: {
      data: input.data,
      meta: { correlationId: input.correlationId, asAt: input.asAt, degraded: false },
      page: { nextCursor: input.nextCursor, hasMore: input.nextCursor !== null },
    },
  };
}

/** Answers a refusal raised at the boundary, in the same error envelope the domain uses. */
export function queueValidationAnswer(
  correlationId: string,
  cause: string,
  message: string,
  fields: Readonly<Record<string, string>>,
): QueueAnswer {
  return {
    status: 400,
    body: {
      error: { code: 'VALIDATION_FAILED', cause, message, correlationId, fields },
    },
  };
}

/** Prints one answer with the headers the admin reads share. */
export function jsonQueueAnswer(answer: QueueAnswer, correlationId: string): Response {
  return Response.json(answer.body, {
    status: answer.status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Correlation-Id': correlationId,
    },
  });
}
