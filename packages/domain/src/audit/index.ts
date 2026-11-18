/**
 * The audit module: the `AuditEvent` record, the append use case, the access-log read and the
 * `C-077` boundary that joins audit and analytics.
 *
 * Nothing here updates or deletes an entry. The store port offers `append` and `read` only, so the
 * append-only rule is enforced by the shape of the dependency rather than by a comment asking callers
 * to behave.
 */
export {
  ACTOR_ROLES,
  type ActorRole,
  type AuditAccessLogEntry,
  type AuditEventDraft,
  type AuditEventRecord,
} from './entities.ts';
export {
  AUDIT_ACTION_MAX_LENGTH,
  AUDIT_ACTION_PATTERN,
  KNOWN_AUDIT_ACTIONS,
  isKnownAuditAction,
  type KnownAuditAction,
} from './actions.ts';
export {
  validateAuditEventInput,
  type AcceptedAuditEvent,
  type AuditEventInput,
  type AuditFailureCode,
  type AuditFieldReason,
  type AuditRejection,
  type AuditValidationResult,
} from './envelope.ts';
export { findReasonFinding, type ReasonFinding } from './personal-data.ts';
export {
  appendAuditEvent,
  appendValidatedAuditEvent,
  type AppendAuditEventDeps,
  type AppendAuditEventInput,
  type AppendAuditEventResult,
  type AuditAppendAccepted,
} from './append.ts';
export {
  ACCESS_LOG_DEFAULT_LIMIT,
  ACCESS_LOG_MAX_LIMIT,
  readAuditAccessLog,
  type ReadAuditAccessLogInput,
  type ReadAuditAccessLogResult,
} from './access-log.ts';
export {
  AUDIT_ANALYTICS_OPERATIONS,
  handleAuditAnalyticsBoundary,
  type AnalyticsEmitAccepted,
  type AuditAnalyticsBoundaryDeps,
  type AuditAnalyticsBoundaryRequest,
  type AuditAnalyticsBoundaryResponse,
  type AuditAnalyticsCaller,
  type AuditAnalyticsFailure,
  type AuditAnalyticsOperation,
} from './boundary.ts';
export type { AuditAccessLogPort, AuditAppendPort, AuditIdentifierPort } from './ports.ts';
