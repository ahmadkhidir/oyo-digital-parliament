/**
 * The audit and analytics boundary (`C-077`).
 *
 * One internal RPC surface, four operations, and the rules that keep them from leaking into each
 * other. The audit half is append-only and a failed append fails the write it was recording. The
 * analytics half carries a pseudonymous identifier and no person, and a failed emit is the caller's
 * problem to buffer, never the originating write's.
 *
 * The caller's component is passed in beside the request rather than read from `args`: the internal
 * RPC authenticates the service credential, and a component named inside the payload could claim to
 * be any component it liked. `C-077` requires `FORBIDDEN_ROLE` when an emitter is not on the permitted
 * list, so the list is supplied by the composition root as configuration rather than guessed here.
 */
import { parseAnalyticsEmitRequest } from '../analytics/envelope.ts';
import {
  replaceAnalyticsUserToken,
  type ReplaceUserTokenResult,
} from '../analytics/replace-user-token.ts';
import type { AnalyticsStorePort } from '../analytics/ports.ts';
import { appendValidatedAuditEvent, type AppendAuditEventResult } from './append.ts';
import { readAuditAccessLog, type ReadAuditAccessLogResult } from './access-log.ts';
import { validateAuditEventInput } from './envelope.ts';
import type { AuditAccessLogPort, AuditAppendPort, AuditIdentifierPort } from './ports.ts';
import type { PseudonymTokenPort } from '../analytics/ports.ts';

/** The four operations `C-077` declares. There is no fifth, and no update or delete among them. */
export const AUDIT_ANALYTICS_OPERATIONS = [
  'audit.append',
  'analytics.emit',
  'audit.readAccessLog',
  'analytics.replaceUserToken',
] as const;

/** One of the boundary's operations. */
export type AuditAnalyticsOperation = (typeof AUDIT_ANALYTICS_OPERATIONS)[number];

/** What the boundary needs to do its work. */
export interface AuditAnalyticsBoundaryDeps {
  readonly audit: {
    readonly store: AuditAppendPort;
    readonly accessLog: AuditAccessLogPort;
    readonly identifiers: AuditIdentifierPort;
  };
  readonly analytics: {
    readonly store: AnalyticsStorePort;
    readonly pseudonymTokens: PseudonymTokenPort;
  };
  /** Components allowed to emit product events. Configuration, not a literal. */
  readonly permittedAnalyticsComponents: readonly string[];
}

/** The authenticated caller, from the service credential, not from the payload. */
export interface AuditAnalyticsCaller {
  readonly component: string;
}

/** The wire request: an operation and its arguments. */
export interface AuditAnalyticsBoundaryRequest {
  readonly operation: string;
  readonly args: Readonly<Record<string, unknown>>;
}

/** A failure in the `C-001` error shape. */
export interface AuditAnalyticsFailure {
  readonly code: 'VALIDATION_FAILED' | 'FORBIDDEN_ROLE' | 'POLICY_VIOLATION' | 'SERVICE_DEGRADED';
  readonly cause: string;
  readonly message: string;
  readonly fields: Readonly<Record<string, string>>;
}

/** The boundary's answer. */
export type AuditAnalyticsBoundaryResponse =
  | {
      readonly ok: true;
      readonly operation: AuditAnalyticsOperation;
      readonly status: 200 | 201;
      readonly result: AppendAuditEventResult | ReadAuditAccessLogResult | ReplaceUserTokenResult | AnalyticsEmitAccepted;
    }
  | { readonly ok: false; readonly status: 400 | 403 | 422 | 503; readonly error: AuditAnalyticsFailure };

/** The `C-089` response shape for an accepted event. */
export interface AnalyticsEmitAccepted {
  readonly ok: true;
  readonly accepted: true;
  readonly event_id: string;
  readonly storedAt: string;
}

/** Which HTTP status a failure code carries, per the `C-001` table. */
function statusFor(code: AuditAnalyticsFailure['code']): 400 | 403 | 422 | 503 {
  switch (code) {
    case 'VALIDATION_FAILED':
      return 400;
    case 'FORBIDDEN_ROLE':
      return 403;
    case 'POLICY_VIOLATION':
      return 422;
    case 'SERVICE_DEGRADED':
      return 503;
  }
}

/** Wraps a rejection in the boundary envelope. */
function failure(
  code: AuditAnalyticsFailure['code'],
  cause: string,
  message: string,
  fields: Readonly<Record<string, string>> = {},
): AuditAnalyticsBoundaryResponse {
  return { ok: false, status: statusFor(code), error: { code, cause, message, fields } };
}

/** Whether a request names one of the four operations. */
function isOperation(value: string): value is AuditAnalyticsOperation {
  return (AUDIT_ANALYTICS_OPERATIONS as readonly string[]).includes(value);
}

/**
 * Handles one `C-077` call.
 *
 * @param deps - The audit log, the access log, the analytics store, the token derivation and the
 * permitted emitter list.
 * @param caller - The authenticated component making the call.
 * @param request - The operation and its arguments.
 */
export async function handleAuditAnalyticsBoundary(
  deps: AuditAnalyticsBoundaryDeps,
  caller: AuditAnalyticsCaller,
  request: AuditAnalyticsBoundaryRequest,
): Promise<AuditAnalyticsBoundaryResponse> {
  if (typeof request.operation !== 'string' || !isOperation(request.operation)) {
    return failure(
      'VALIDATION_FAILED',
      'OPERATION_UNKNOWN',
      'The boundary serves audit.append, analytics.emit, audit.readAccessLog and analytics.replaceUserToken.',
      { operation: 'ENUM_MISMATCH' },
    );
  }
  if (typeof request.args !== 'object' || request.args === null || Array.isArray(request.args)) {
    return failure('VALIDATION_FAILED', 'ARGS_MALFORMED', 'The call carries no argument object.', {
      args: 'REQUIRED',
    });
  }

  switch (request.operation) {
    case 'audit.append': {
      const validated = validateAuditEventInput(request.args);
      if (!validated.ok) {
        return failure(validated.code, validated.cause, validated.message, validated.fields);
      }
      const result = await appendValidatedAuditEvent(deps.audit, validated.accepted);
      if (!result.ok) return failure(result.code, result.cause, result.message, result.fields);
      return { ok: true, operation: request.operation, status: 201, result };
    }

    case 'analytics.emit': {
      if (!deps.permittedAnalyticsComponents.includes(caller.component)) {
        return failure(
          'FORBIDDEN_ROLE',
          'COMPONENT_NOT_PERMITTED',
          'This component is not on the list that may emit product events.',
        );
      }
      const validated = parseAnalyticsEmitRequest(request.args);
      if (!validated.ok) {
        return failure(validated.code, validated.cause, validated.message, validated.fields);
      }
      try {
        const { storedAt } = await deps.analytics.store.emit(validated.request);
        return {
          ok: true,
          operation: request.operation,
          status: 201,
          result: { ok: true, accepted: true, event_id: validated.request.event_id, storedAt },
        };
      } catch {
        return failure(
          'SERVICE_DEGRADED',
          'ANALYTICS_STORE_UNAVAILABLE',
          'The analytics store did not take the event; the caller buffers and retries it.',
        );
      }
    }

    case 'audit.readAccessLog': {
      const since = request.args['since'];
      const limit = request.args['limit'];
      const result = await readAuditAccessLog(
        { accessLog: deps.audit.accessLog },
        {
          ...(typeof since === 'string' ? { since } : {}),
          ...(typeof limit === 'number' ? { limit } : {}),
        },
      );
      if (!result.ok) return failure(result.code, result.cause, result.message, result.fields);
      return { ok: true, operation: request.operation, status: 200, result };
    }

    case 'analytics.replaceUserToken': {
      const userId = request.args['userId'];
      const result = await replaceAnalyticsUserToken(
        { store: deps.analytics.store, pseudonymTokens: deps.analytics.pseudonymTokens },
        { userId: typeof userId === 'string' ? userId : '' },
      );
      if (!result.ok) return failure(result.code, result.cause, result.message, result.fields);
      return { ok: true, operation: request.operation, status: 200, result };
    }
  }
}
