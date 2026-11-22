/**
 * Evaluation harness shapes (`NFR-051`, `architecture.md` Evaluation Harness).
 *
 * A labelled set is fixed once labelled. A run stores the `ModelEvaluation` record plus the failing
 * cases, so a failing run names what it failed on and a passing run can be defended. Neither the
 * label set nor a run carries a resident's description beyond the set itself: cases are identified
 * by an opaque `caseId` and a ward identifier.
 *
 * @module harness/types
 */
import type { CapabilityName, InferenceOutcome } from '../gateway/contract.ts';

/** One labelled `ward_candidate` case. */
export interface WardCandidateCase {
  /** Opaque identifier for the case; never a member identifier. */
  readonly caseId: string;
  /** The description collected during assisted intake. Never leaves the labelled set. */
  readonly description: string;
  readonly localGovernmentArea?: string;
  /** The ward the ward-reference reviewer confirmed, or `null` when the resident confirmed none. */
  readonly confirmedWardId: string | null;
}

/** A fixed labelled set for one capability. */
export interface WardCandidateLabelledSet {
  readonly capability: 'ward_candidate';
  /** The `NFR-051` set: two hundred real descriptions. */
  readonly cases: readonly WardCandidateCase[];
}

/** One case a run did not get right, named without the description. */
export interface EvaluationFailingCase {
  readonly caseId: string;
  readonly expectedWardId: string | null;
  readonly topWardId: string | null;
  readonly outcome: InferenceOutcome;
  readonly reasonCode: string | null;
}

/** The stored `ModelEvaluation` record (`schema.md` ModelEvaluation). */
export interface ModelEvaluation {
  readonly id: string;
  readonly capability: CapabilityName;
  readonly modelVersion: string;
  readonly datasetSize: number;
  readonly metric: string;
  readonly threshold: number;
  readonly result: number;
  readonly passed: boolean;
  readonly runAt: string;
}

/** One run's record and the cases behind its result. */
export interface EvaluationRun {
  readonly evaluation: ModelEvaluation;
  readonly failingCases: readonly EvaluationFailingCase[];
}

/** Where a run is stored: the primary database record and the object-storage artefact. */
export interface EvaluationStore {
  save(run: EvaluationRun): Promise<void>;
}
