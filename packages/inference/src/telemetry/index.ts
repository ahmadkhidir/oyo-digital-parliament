/**
 * The inference telemetry seam (`EVT-038`, `EVT-041`, `analytics.md`).
 *
 * The gateway emits exactly the two events it owns: one per completed call and one per fallback.
 * The property set is the taxonomy's — capability, latency, model version, outcome, cost, rank and
 * reason code — and nothing a resident wrote. The payload shape digest and the actor values live in
 * audit, never here.
 *
 * An emitter failure never fails the call: `C-089` says analytics is buffered and retried by its
 * caller, and a resident must never wait on a metric.
 *
 * @module telemetry
 */
import type { CapabilityName, InferenceOutcome } from '../gateway/contract.ts';

/** `EVT-038` `model_request_completed`. */
export interface ModelRequestCompletedEvent {
  readonly capability: CapabilityName;
  readonly latencyMs: number;
  readonly modelVersion: string;
  readonly outcome: InferenceOutcome;
  readonly costMicros: number;
  /** `C-089` requires the correlation identifier on the four model events. */
  readonly correlationId: string;
}

/** `EVT-041` `model_fallback_triggered`. Carries the stable cause and no free text. */
export interface ModelFallbackTriggeredEvent {
  readonly capability: CapabilityName;
  /** The `C-001` cause the capability failed with, for example `TIMEOUT`. */
  readonly reasonCode: string;
  readonly correlationId: string;
}

/** The two emissions the gateway performs. */
export interface InferenceTelemetry {
  /** `EVT-038`: the gateway returns. */
  modelRequestCompleted(event: ModelRequestCompletedEvent): void | Promise<void>;
  /** `EVT-041`: the capability falls back to its deterministic path. */
  modelFallbackTriggered(event: ModelFallbackTriggeredEvent): void | Promise<void>;
}
