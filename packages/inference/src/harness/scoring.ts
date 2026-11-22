/**
 * The `NFR-051` scoring rule.
 *
 * Judged bar: "Share of suggestions where the resident confirms the top candidate", 70% or better,
 * over 200 real descriptions checked by the ward-reference reviewer.
 *
 * Every labelled case is in the denominator, including a case where the resident confirmed nothing:
 * a suggestion that was not confirmed did not work, and dropping it would inflate the result. A run
 * on fewer than the stated number of cases cannot pass, however high the share — a smaller sample is
 * not the judged bar and the harness never relaxes one to make a run green.
 *
 * @module harness/scoring
 */
import type { InferenceOutcome } from '../gateway/contract.ts';
import type { CapabilityMetric } from '../capabilities/definition.ts';
import type { EvaluationFailingCase, WardCandidateCase } from './types.ts';

/** What one case's call produced, after the gateway answered. */
export interface CaseObservation {
  readonly caseId: string;
  /** The first candidate's ward, or `null` when the capability returned no result. */
  readonly topWardId: string | null;
  readonly outcome: InferenceOutcome;
  /** The `C-001` cause for a non-`ok` outcome; `null` when the call succeeded. */
  readonly reasonCode: string | null;
}

/** The measured share and the cases that missed. */
export interface WardCandidateScore {
  readonly result: number;
  readonly passed: boolean;
  readonly failingCases: readonly EvaluationFailingCase[];
}

/**
 * Scores a run against `NFR-051`.
 *
 * @param cases - The fixed labelled set.
 * @param observations - One observation per case, in the same order.
 * @param metric - The capability's judged bar, which states the threshold and minimum set size.
 * @returns The share, whether the bar was cleared, and every case that missed.
 */
export function scoreWardCandidate(
  cases: readonly WardCandidateCase[],
  observations: readonly CaseObservation[],
  metric: CapabilityMetric,
): WardCandidateScore {
  if (cases.length !== observations.length) {
    throw new Error('every labelled case must be observed exactly once');
  }

  const observationsById = new Map(
    observations.map((observation) => [observation.caseId, observation]),
  );
  const failingCases: EvaluationFailingCase[] = [];
  let confirmedTop = 0;

  for (const labelled of cases) {
    const observation = observationsById.get(labelled.caseId);
    if (observation === undefined) throw new Error(`case ${labelled.caseId} was not observed`);

    if (labelled.confirmedWardId !== null && observation.topWardId === labelled.confirmedWardId) {
      confirmedTop += 1;
      continue;
    }
    failingCases.push({
      caseId: labelled.caseId,
      expectedWardId: labelled.confirmedWardId,
      topWardId: observation.topWardId,
      outcome: observation.outcome,
      reasonCode: observation.reasonCode,
    });
  }

  const result = cases.length === 0 ? 0 : confirmedTop / cases.length;
  const passed = cases.length >= metric.minimumDatasetSize && result >= metric.threshold;

  return { result, passed, failingCases };
}
