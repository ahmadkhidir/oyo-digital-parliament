/**
 * The one place an outcome is shaped (`C-078`, `packages/inference/AGENTS.md` Structure).
 *
 * Every path through the gateway ends here, so two guarantees are structural rather than repeated:
 * a result exists only on `ok`, and a capability that ran always reports the pinned model version,
 * its latency, its cost and the fields the boundary withheld.
 *
 * @module gateway/outcome
 */
import type {
  CapabilityName,
  InferenceError,
  InferenceOutcome,
  InferenceResponse,
  InvokeResult,
} from './contract.ts';

/** The envelope facts every finished capability call reports. */
export interface OutcomeFacts {
  readonly capability: CapabilityName;
  readonly modelVersion: string;
  readonly latencyMs: number;
  readonly costMicros: number;
  readonly removedFields: readonly string[];
}

/**
 * A successful result.
 *
 * Only this builder accepts a result value; every other outcome is typed with `never`, which is how
 * `C-078`'s "there is no partial result" is enforced by the compiler.
 *
 * @param facts - Capability, version, latency, cost and removed fields.
 * @param result - The validated `C-079` to `C-082` result.
 */
export function okOutcome<Result>(facts: OutcomeFacts, result: Result): InvokeResult<Result> {
  return {
    ok: true,
    response: { ...facts, outcome: 'ok', result },
  };
}

/**
 * A capability that ran and produced nothing.
 *
 * @param facts - Capability, version, latency, cost and removed fields.
 * @param outcome - `timeout`, `refused`, `disabled` or `error`.
 * @param error - The `C-078` failure, always `CAPABILITY_UNAVAILABLE`.
 */
export function emptyOutcome(
  facts: OutcomeFacts,
  outcome: Exclude<InferenceOutcome, 'ok'>,
  error: InferenceError,
): InvokeResult<never> {
  const response: InferenceResponse<never> = { ...facts, outcome, result: null };
  return { ok: false, error, response };
}

/**
 * A call refused before dispatch.
 *
 * No envelope is returned because no capability ran; the refusal names its rule and, where
 * validation is involved, the offending field paths.
 *
 * @param error - `VALIDATION_FAILED`, `POLICY_VIOLATION` or `RATE_LIMITED`.
 */
export function refusedCall(error: InferenceError): InvokeResult<never> {
  return { ok: false, error, response: null };
}
