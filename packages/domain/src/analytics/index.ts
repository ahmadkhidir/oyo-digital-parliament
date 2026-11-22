/**
 * The analytics module: the event taxonomy, the `C-089` envelope, the deletion-propagation use case
 * and the ports the adapters implement.
 *
 * Everything here is pure or port-driven. No clock is read, no identifier is generated, nothing is
 * sent: the caller supplies the time, the ids, the identity and the locale, and receives a validated
 * envelope or a refusal.
 */
export {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENTS,
  ANALYTICS_LOCALES,
  COMMENT_ROUTING_FLAGS,
  COMMITMENT_STATUSES,
  CONSENT_PURPOSES,
  DATA_REQUEST_TYPES,
  DECISION_TYPES,
  IDENTITY_STATES,
  LOCATION_SCOPES,
  MODEL_CAPABILITIES,
  MODEL_OUTCOMES,
  PILLARS,
  RESIDENCE_DECISIONS,
  RESIDENCE_METHODS,
  SESSION_RESERVATION_STATUSES,
  SUBMISSION_SOURCES,
  SUBMISSION_TYPES,
  VERIFICATION_METHODS,
  analyticsEventDefinition,
  isAnalyticsEventName,
  type AnalyticsEventDefinition,
  type AnalyticsEventName,
  type AnalyticsLocale,
  type AnalyticsPayloads,
  type EvtId,
} from './events.ts';
export {
  booleanKind,
  enumKind,
  identifierKind,
  integerKind,
  quarterKind,
  tokenKind,
  type AnalyticsPropertyKind,
  type KindFor,
} from './kinds.ts';
export {
  buildAnalyticsEvent,
  parseAnalyticsEmitRequest,
  type AnalyticsEmitRequest,
  type AnalyticsEmitResult,
  type AnalyticsEventInput,
  type AnalyticsFailureCode,
  type AnalyticsRejection,
  type FieldReason,
} from './envelope.ts';
export {
  findPersonalDataFindings,
  isPersonalPropertyKey,
  type PersonalDataFinding,
} from './personal-data.ts';
export {
  replaceAnalyticsUserToken,
  type ReplaceUserTokenDeps,
  type ReplaceUserTokenResult,
} from './replace-user-token.ts';
export type { AnalyticsStorePort, PseudonymTokenPort } from './ports.ts';
export {
  ANALYTICS_USER_ID_PATTERN,
  ANALYTICS_USER_PREFIX,
  analyticsUserIdFor,
} from './identity.ts';
