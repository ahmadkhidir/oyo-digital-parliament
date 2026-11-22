/**
 * The `C-007` session-read answer, as the `C-001` envelope (`NFR-026`, `NFR-040`).
 *
 * The route handler reads the two cookie namespaces and hands the domain's answer to this module,
 * which turns it into the wire body and the status. Keeping the mapping here rather than in
 * `app/api/session/route.ts` is what makes every state of the entry testable without a request:
 * a signed-in member, a signed-in staff user, a signed-out visitor, an expired or unknown token,
 * and the degraded store refusal.
 *
 * Two rules the mapping keeps:
 *
 * - **Signed out is a successful answer, not an error.** `C-007` says so explicitly, so the
 *   signed-out state is `200` with `signedIn:false` and both actor objects `null`.
 * - **The body carries exactly what the contract prints.** The member projection is the domain's
 *   `SessionMemberProjection` and the staff projection is the one `C-007` and `C-092` share; no
 *   telephone number, full name or declared age is added here, and the staff answer never carries a
 *   member object.
 *
 * `meta.asAt` is the instant the domain computed the answer, from the injected clock, not the time
 * the transport formatted it. A degraded store answers `SERVICE_DEGRADED` with no privileged data,
 * which is the refusal `C-007` names for that case.
 */
import type {
  IdentityFailure,
  IdentityFailureCode,
  IdentityFailureMeta,
  IdentityFieldReason,
  Locale,
  ReadSessionResult,
  SessionCookie,
  SessionMemberProjection,
  StaffProjection,
} from '@odp/domain';

/** The `C-007` signed-out body. */
export interface SessionReadSignedOutData {
  readonly signedIn: false;
  readonly member: null;
  readonly staff: null;
  readonly locale: Locale;
}

/** The `C-007` member body. */
export interface SessionReadMemberData {
  readonly signedIn: true;
  readonly member: SessionMemberProjection;
  readonly staff: null;
  readonly locale: Locale;
  readonly session: { readonly expiresAt: string };
}

/** The `C-007` staff body. */
export interface SessionReadStaffData {
  readonly signedIn: true;
  readonly member: null;
  readonly staff: StaffProjection;
  readonly locale: Locale;
  readonly session: { readonly expiresAt: string; readonly absoluteExpiresAt: string };
}

/** `C-001` `meta` for a read that was not served from a cache. */
export interface SessionReadMeta {
  readonly correlationId: string;
  readonly asAt: string;
  readonly degraded: false;
}

/** The `C-001` error body `C-007` can produce. */
export interface SessionReadError {
  readonly code: IdentityFailureCode;
  readonly cause: string;
  readonly message: string;
  readonly correlationId: string;
  readonly fields?: Readonly<Record<string, IdentityFieldReason>>;
  readonly retryAfterSeconds?: number;
  readonly meta?: IdentityFailureMeta;
}

/** One answer the route handler returns: the body, its HTTP status, and any cookie it sets. */
export type SessionReadAnswer =
  | {
      readonly status: 200;
      readonly body: {
        readonly data: SessionReadSignedOutData | SessionReadMemberData | SessionReadStaffData;
        readonly meta: SessionReadMeta;
      };
      /** The renewed or clearing cookie the domain answered with, when it answered with one. */
      readonly cookie?: SessionCookie;
    }
  | {
      readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 423 | 429 | 503;
      readonly body: { readonly error: SessionReadError };
    };

/** The HTTP status a `C-007` refusal can carry, from the `C-001` table. */
type SessionFailureStatus = 400 | 401 | 403 | 404 | 409 | 422 | 423 | 429 | 503;

/** The status `C-001` fixes for each failure code `readSession` can return. */
const STATUS_BY_CODE: Readonly<
  Record<Exclude<IdentityFailureCode, 'WRITE_QUEUED'>, SessionFailureStatus>
> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN_ROLE: 403,
  NOT_FOUND: 404,
  CONFLICT_ALREADY_DECIDED: 409,
  POLICY_VIOLATION: 422,
  RATE_LIMITED: 429,
  LEGAL_HOLD: 423,
  SERVICE_DEGRADED: 503,
};

/**
 * Turns one domain answer into the route handler's answer.
 *
 * @param result - The `readSession` answer, refusal included.
 * @param meta - The request's correlation identifier and the instant the use case computed.
 */
export function sessionReadAnswer(
  result: ReadSessionResult,
  meta: { readonly correlationId: string; readonly asAt: string },
): SessionReadAnswer {
  if (!result.ok) return failureAnswer(result, meta.correlationId);

  const answerMeta: SessionReadMeta = { ...meta, degraded: false };

  if (!result.signedIn) {
    return {
      status: 200,
      body: {
        data: {
          signedIn: false,
          member: null,
          staff: null,
          locale: result.locale,
        },
        meta: answerMeta,
      },
      ...(result.cookie === undefined ? {} : { cookie: result.cookie }),
    };
  }

  if (result.member !== null) {
    return {
      status: 200,
      body: {
        data: {
          signedIn: true,
          member: result.member,
          staff: null,
          locale: result.locale,
          session: { expiresAt: result.session.expiresAt },
        },
        meta: answerMeta,
      },
      ...(result.cookie === undefined ? {} : { cookie: result.cookie }),
    };
  }

  return {
    status: 200,
    body: {
      data: {
        signedIn: true,
        member: null,
        staff: result.staff,
        locale: result.locale,
        session: {
          expiresAt: result.session.expiresAt,
          absoluteExpiresAt: result.session.absoluteExpiresAt,
        },
      },
      meta: answerMeta,
    },
    ...(result.cookie === undefined ? {} : { cookie: result.cookie }),
  };
}

/** Wraps a domain refusal into the `C-001` error envelope, without enriching it. */
function failureAnswer(failure: IdentityFailure, correlationId: string): SessionReadAnswer {
  return {
    status: statusForFailure(failure.code),
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

/**
 * The `C-001` status for a refusal.
 *
 * `WRITE_QUEUED` is the one code `C-001` types as `ok:true` (`202`), so a use case never returns it
 * as a failure; a value that did would be a domain defect, and the read answers `503` rather than
 * mistake a queued write for a served read.
 */
function statusForFailure(code: IdentityFailureCode): SessionFailureStatus {
  return code === 'WRITE_QUEUED' ? 503 : STATUS_BY_CODE[code];
}
