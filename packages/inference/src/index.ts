/**
 * The `@odp/inference` public surface.
 *
 * One entry point reaches a model provider: `createInferenceGateway(...).invoke(...)`. Everything
 * else exported here is a type, a pinned declaration or the evaluation harness, which itself runs
 * through that gateway. There is deliberately no adapter factory on this surface — the composition
 * root selects a provider through configuration, and a caller cannot build a second egress.
 *
 * @module index
 */
export {
  CAPABILITY_NAMES,
  INFERENCE_ERROR_CODES,
  INFERENCE_OUTCOMES,
  type CapabilityName,
  type InferenceError,
  type InferenceErrorCode,
  type InferenceOutcome,
  type InferenceResponse,
  type InvocationCaller,
  type InvokeRequest,
  type InvokeResult,
} from './gateway/contract.ts';
export {
  createInferenceGateway,
  type GatewayDependencies,
  type InferenceGateway,
} from './gateway/invoke.ts';
export type { InferenceAuditEvent, InferenceAuditPort } from './gateway/audit.ts';

export {
  CAPABILITY_FLAGS,
  type CapabilityDefinition,
  type CapabilityFlagName,
  type CapabilityMetric,
} from './capabilities/definition.ts';
export {
  readWardCandidatePayload,
  readWardCandidateResult,
  wardCandidateCapability,
  WARD_CANDIDATE_INSTRUCTION,
  WARD_CANDIDATE_INSTRUCTION_VERSION,
  WARD_CANDIDATE_LIMIT_MAX,
  WARD_DESCRIPTION_MAX_LENGTH,
  type WardCandidate,
  type WardCandidatePayload,
  type WardCandidateResult,
} from './capabilities/ward_candidate/index.ts';

export {
  defineInferenceConfig,
  InferenceConfigurationError,
  type CapabilityPinning,
  type CapabilityPinningInput,
  type InferenceConfig,
  type InferenceConfigInput,
  type ModelProvider,
} from './config/index.ts';

export {
  deidentify,
  type AllowedValue,
  type DeidentifiedPayload,
  type DeidentificationResult,
} from './deidentification/deidentify.ts';
export { DIRECT_IDENTIFIER_FIELDS } from './deidentification/allow-list.ts';
export { payloadShapeDigest } from './deidentification/digest.ts';

export { callCostMicros } from './cost/cost.ts';
export { createCostLedger, type CostLedger, type SpendCheck } from './cost/ledger.ts';

export type {
  InferenceTelemetry,
  ModelFallbackTriggeredEvent,
  ModelRequestCompletedEvent,
} from './telemetry/index.ts';

export {
  MEASURED_CAPABILITY,
  runWardCandidateEvaluation,
  type EvaluationDependencies,
} from './harness/run.ts';
export {
  scoreWardCandidate,
  type CaseObservation,
  type WardCandidateScore,
} from './harness/scoring.ts';
export { createJsonFileEvaluationStore } from './harness/file-store.ts';
export type {
  EvaluationFailingCase,
  EvaluationRun,
  EvaluationStore,
  ModelEvaluation,
  WardCandidateCase,
  WardCandidateLabelledSet,
} from './harness/types.ts';
