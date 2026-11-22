/**
 * The `C-078` invocation envelope, in the shapes the gateway accepts and answers.
 *
 * These are the only request and response types a caller sees. The gateway rewrites the three
 * pinned fields (`modelVersion`, `timeoutMs`, `costCeilingMicrosPerThousand`) from configuration, so
 * a value a caller supplies is accepted for shape compatibility and then ignored — `C-078` is
 * explicit that the pinned declaration wins.
 *
 * @module gateway/contract
 */

/** The four capabilities `C-078` enumerates. Only the ones registered in `registry.ts` are reachable. */
export const CAPABILITY_NAMES = [
  'similar_submission',
  'ward_candidate',
  'moderation_routing',
  'budget_line_extraction',
] as const;

/** One model-backed capability name. */
export type CapabilityName = (typeof CAPABILITY_NAMES)[number];

/**
 * What the gateway reports. `ok` is the only outcome that carries a result; the other four are
 * `C-078`'s `timeout`, `refused`, `disabled` and `error`, each with `result: null`.
 */
export const INFERENCE_OUTCOMES = ['ok', 'timeout', 'refused', 'disabled', 'error'] as const;

/** One gateway outcome. */
export type InferenceOutcome = (typeof INFERENCE_OUTCOMES)[number];

/** Who called the gateway, named in `C-078`'s envelope and carried on every telemetry event. */
export interface InvocationCaller {
  /** The calling component, for example `ward_service` or `evaluation_harness`. */
  readonly component: string;
  /** The `C-001` correlation identifier in its `req_` form. */
  readonly correlationId: string;
}

/**
 * The `C-078` request.
 *
 * The three pinned fields are optional because the gateway ignores them; they stay on the type so
 * a caller may post the contract's example unchanged and the gateway can record that it rewrote
 * them.
 */
export interface InvokeRequest {
  readonly capability: CapabilityName;
  readonly modelVersion?: string;
  readonly timeoutMs?: number;
  readonly costCeilingMicrosPerThousand?: number;
  readonly caller: InvocationCaller;
  readonly payload: unknown;
}

/** The `C-078` response envelope, generic over the one capability's result shape. */
export interface InferenceResponse<Result> {
  readonly capability: CapabilityName;
  readonly modelVersion: string;
  readonly outcome: InferenceOutcome;
  readonly latencyMs: number;
  readonly costMicros: number;
  /** Fields the de-identification boundary withheld, so `NFR-045` inspection stays reproducible. */
  readonly removedFields: readonly string[];
  /** `null` on every outcome but `ok`; there is no partial result (`C-078`). */
  readonly result: Result | null;
}

/** The failure codes `C-078` names, plus the degraded path a refused gateway raises. */
export const INFERENCE_ERROR_CODES = [
  'CAPABILITY_UNAVAILABLE',
  'POLICY_VIOLATION',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'SERVICE_DEGRADED',
] as const;

/** One failure code from the frozen `C-001` taxonomy. */
export type InferenceErrorCode = (typeof INFERENCE_ERROR_CODES)[number];

/** A failure the gateway answers instead of a result. */
export interface InferenceError {
  readonly code: InferenceErrorCode;
  /** Stable upper-snake token, for example `CAPABILITY_DISABLED` or `TIMEOUT`. */
  readonly cause: string;
  /** A sentence naming the rule, never a payload value or provider body. */
  readonly message: string;
  /** Field-path to `C-001` reason token, present when validation is involved. */
  readonly fields?: Readonly<Record<string, string>>;
  /** Present on `RATE_LIMITED`, as `C-078` requires. */
  readonly retryAfterSeconds?: number;
}

/**
 * What `invoke` returns.
 *
 * A call refused before dispatch (`VALIDATION_FAILED`, `POLICY_VIOLATION`, `RATE_LIMITED`) has no
 * response envelope because no capability ran. A capability that ran but produced no result carries
 * the envelope with `result: null` beside its `CAPABILITY_UNAVAILABLE` error, exactly as `C-078`
 * prints it.
 */
export type InvokeResult<Result> =
  | {
      readonly ok: true;
      readonly response: InferenceResponse<Result>;
    }
  | {
      readonly ok: false;
      readonly error: InferenceError;
      readonly response: InferenceResponse<never> | null;
    };
