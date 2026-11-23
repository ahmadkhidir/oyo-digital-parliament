/**
 * The `C-001` response envelopes for the two ward route handlers (`C-009`, `C-010`).
 *
 * One read envelope and one error envelope. The correlation rule is not restated here: it belongs to
 * the logging module's barrel, which every surface imports, so the ward handlers and the rest of the
 * deployable cannot drift apart (`C-001`).
 */
import type { WardFailure } from '@odp/domain';

/** The HTTP status each failure code these handlers can produce answers with (`C-001`). */
const FAILURE_STATUS: Readonly<Record<WardFailure['code'], number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  NOT_FOUND: 404,
  CONFLICT_ALREADY_DECIDED: 409,
  POLICY_VIOLATION: 422,
  SERVICE_DEGRADED: 503,
};

/** The `C-001` read envelope for a successful answer. */
export interface ReadEnvelope {
  readonly data: unknown;
  readonly meta: {
    readonly correlationId: string;
    readonly asAt: string;
    readonly degraded: false;
  };
  readonly page?: { readonly nextCursor: string | null; readonly hasMore: boolean };
}

/**
 * Builds the read envelope.
 *
 * @param data - The response's `data` member.
 * @param context - The request's correlation identifier.
 * @param options - The instant the answer was computed, and the page cursor where the entry prints
 *   one (`C-009` does, `C-010` does not).
 */
export function readEnvelope(
  data: unknown,
  context: { readonly correlationId: string },
  options: {
    readonly asAt: string;
    readonly nextCursor?: string | null;
    readonly hasMore?: boolean;
  },
): { readonly status: 200; readonly body: ReadEnvelope } {
  return {
    status: 200,
    body: {
      data,
      meta: {
        correlationId: context.correlationId,
        asAt: options.asAt,
        degraded: false,
      },
      ...(options.nextCursor === undefined
        ? {}
        : {
            page: {
              nextCursor: options.nextCursor,
              hasMore: options.hasMore ?? options.nextCursor !== null,
            },
          }),
    },
  };
}

/** The `C-001` error envelope. */
export interface ErrorEnvelope {
  readonly error: {
    readonly code: WardFailure['code'];
    readonly cause: string;
    readonly message: string;
    readonly correlationId: string;
    readonly fields?: Readonly<Record<string, string>>;
  };
}

/** Turns a domain refusal into the `C-001` error body and its status. */
export function failureEnvelope(
  failure: WardFailure,
  context: { readonly correlationId: string },
): { readonly status: number; readonly body: ErrorEnvelope } {
  return {
    status: FAILURE_STATUS[failure.code],
    body: {
      error: {
        code: failure.code,
        cause: failure.cause,
        message: failure.message,
        correlationId: context.correlationId,
        ...(Object.keys(failure.fields).length === 0 ? {} : { fields: failure.fields }),
      },
    },
  };
}

/** A boundary refusal, in the same error envelope the domain's refusals use. */
export function validationEnvelope(
  cause: string,
  message: string,
  fields: Readonly<Record<string, string>>,
  context: { readonly correlationId: string },
): { readonly status: 400; readonly body: ErrorEnvelope } {
  return {
    status: 400,
    body: {
      error: {
        code: 'VALIDATION_FAILED',
        cause,
        message,
        correlationId: context.correlationId,
        fields,
      },
    },
  };
}

/** Answers with one envelope and the transport headers the routes share. */
export function jsonResponse(
  status: number,
  body: unknown,
  options: { readonly correlationId: string },
): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Correlation-Id': options.correlationId,
    },
  });
}
