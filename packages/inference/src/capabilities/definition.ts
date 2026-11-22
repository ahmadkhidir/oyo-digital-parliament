/**
 * What a capability contributes to the registry (`C-078`, `packages/inference/AGENTS.md`).
 *
 * One definition is one pinned contract: the payload it accepts, the result it can return, its
 * versioned instruction, the feature flag that switches it on and the judged bar the harness
 * measures it against. A capability with no definition is not reachable, and the gateway has no
 * second route to a provider.
 *
 * @module capabilities/definition
 */
import type { AllowedValue } from '../deidentification/deidentify.ts';
import type { CapabilityName } from '../gateway/contract.ts';

/** The feature flag that enables each capability (`release.md`, `C-069`). */
export const CAPABILITY_FLAGS = {
  similar_submission: 'similar_submission_suggestions',
  ward_candidate: 'ward_candidate_suggestions',
  moderation_routing: 'moderation_routing',
  budget_line_extraction: 'budget_line_extraction',
} as const satisfies Record<CapabilityName, string>;

/** One declared feature flag an inference capability reads. */
export type CapabilityFlagName = (typeof CAPABILITY_FLAGS)[CapabilityName];

/** The judged bar the harness measures a capability against (`nfr.md` `NFR-050` to `NFR-053`). */
export interface CapabilityMetric {
  /** The metric's name, stored on the `ModelEvaluation` record. */
  readonly id: string;
  /** The threshold the measured result must clear. */
  readonly threshold: number;
  /** The labelled-set size the judged bar names; a smaller run cannot pass. */
  readonly minimumDatasetSize: number;
  /** The `NFR-###` the bar comes from. */
  readonly anchor: string;
}

/** A payload that passed its capability's rules. */
export type PayloadRead<Payload> =
  | { readonly ok: true; readonly value: Payload }
  | { readonly ok: false; readonly fields: Readonly<Record<string, string>> };

/** One capability, pinned in full. */
export interface CapabilityDefinition<Payload, Result> {
  readonly name: CapabilityName;
  readonly flag: CapabilityFlagName;
  /** The versioned instruction identifier sent with every call. */
  readonly instructionVersion: string;
  /** The instruction text. Never contains anything a caller supplied. */
  readonly instruction: string;
  /** The deterministic path a caller falls back to when the capability returns nothing. */
  readonly fallback: string;
  readonly metric: CapabilityMetric;
  /**
   * Reads the de-identified payload.
   *
   * Only allow-listed fields reach this function, so it validates rather than filters.
   */
  readPayload(payload: Readonly<Record<string, AllowedValue>>): PayloadRead<Payload>;
  /**
   * Reads a provider's raw answer.
   *
   * @returns The result, or `null` when the answer does not meet the shape exactly. There is no
   *   repair and no partial result (`C-078`).
   */
  readResult(raw: unknown, payload: Payload): Result | null;
}
