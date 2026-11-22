/**
 * The evaluation runner (`architecture.md` Evaluation Harness, `NFR-051`).
 *
 * It runs the fixed labelled set through the real gateway — the same pinned capability a caller
 * reaches, with the same de-identification, timeout and spend trip — scores the result against the
 * judged bar and hands the `ModelEvaluation` and its failing cases to the store. It does not edit
 * the set, drop a case or move a threshold: a failed run is a failed run.
 *
 * The measured capability is enabled for the run's own configuration. The harness exists to measure
 * a version *before* it is promoted, so the live release flag neither blocks nor approves a run;
 * changing the production flag remains an operator action (`C-069`).
 *
 * @module harness/run
 */
import type { CapabilityMetric } from '../capabilities/definition.ts';
import {
  WARD_CANDIDATE_LIMIT_MAX,
  WARD_DESCRIPTION_MAX_LENGTH,
} from '../capabilities/ward_candidate/index.ts';
import type { InferenceGateway } from '../gateway/invoke.ts';
import type { CapabilityName, InferenceOutcome } from '../gateway/contract.ts';
import { scoreWardCandidate, type CaseObservation } from './scoring.ts';
import type {
  EvaluationRun,
  EvaluationStore,
  ModelEvaluation,
  WardCandidateLabelledSet,
} from './types.ts';

/** What the runner needs beyond the gateway. */
export interface EvaluationDependencies {
  readonly gateway: InferenceGateway;
  readonly store: EvaluationStore;
  /** The capability's judged bar, from its registered definition. */
  readonly metric: CapabilityMetric;
  /** The pinned version under measurement; also the version each call sends. */
  readonly modelVersion: string;
  /** Mints the `mev_` identifier. Injected so a run is reproducible in a test. */
  readonly newEvaluationId: () => string;
  /** The run instant; injected rather than read from the wall clock. */
  readonly now: () => Date;
}

/** The correlation identifier form `C-001` requires on `EVT-038` and `EVT-041`. */
function caseCorrelationId(index: number): string {
  return `req_EVAL${String(index + 1).padStart(6, '0')}`;
}

/**
 * Checks the labelled set before any call runs.
 *
 * @throws Error when the set is for another capability, is empty, or repeats a case identifier.
 *   A malformed set is a harness defect, not a capability failure.
 */
function assertLabelledSet(set: WardCandidateLabelledSet): void {
  if (set.capability !== 'ward_candidate') {
    throw new Error('this harness scores the ward_candidate capability only');
  }
  if (set.cases.length === 0) {
    throw new Error('a run with no labelled cases is not a run');
  }
  const seen = new Set<string>();
  for (const labelled of set.cases) {
    if (labelled.caseId === '') throw new Error('every labelled case needs an identifier');
    if (seen.has(labelled.caseId)) {
      throw new Error(`labelled case ${labelled.caseId} appears twice`);
    }
    seen.add(labelled.caseId);
    if (labelled.description === '' || labelled.description.length > WARD_DESCRIPTION_MAX_LENGTH) {
      throw new Error(`labelled case ${labelled.caseId} has a description its contract refuses`);
    }
  }
}

/**
 * Runs one labelled set and stores the evaluation.
 *
 * @param deps - Gateway, store, judged bar, pinned version, identifier and clock.
 * @param set - The fixed labelled set. Never mutated.
 * @returns The stored run, with the failing cases for the operator to read.
 */
export async function runWardCandidateEvaluation(
  deps: EvaluationDependencies,
  set: WardCandidateLabelledSet,
): Promise<EvaluationRun> {
  assertLabelledSet(set);

  const observations: CaseObservation[] = [];

  for (const [index, labelled] of set.cases.entries()) {
    const result = await deps.gateway.invoke({
      capability: 'ward_candidate',
      caller: {
        component: 'evaluation_harness',
        correlationId: caseCorrelationId(index),
      },
      payload: {
        description: labelled.description,
        ...(labelled.localGovernmentArea === undefined
          ? {}
          : { localGovernmentArea: labelled.localGovernmentArea }),
        candidateLimit: WARD_CANDIDATE_LIMIT_MAX,
      },
    });

    const outcome: InferenceOutcome = result.response?.outcome ?? 'error';
    const reasonCode = result.ok ? null : result.error.cause;
    const topWardId = result.ok ? (result.response.result?.candidates[0]?.wardId ?? null) : null;

    observations.push({ caseId: labelled.caseId, topWardId, outcome, reasonCode });
  }

  const score = scoreWardCandidate(set.cases, observations, deps.metric);

  const evaluation: ModelEvaluation = {
    id: deps.newEvaluationId(),
    capability: 'ward_candidate',
    modelVersion: deps.modelVersion,
    datasetSize: set.cases.length,
    metric: deps.metric.id,
    threshold: deps.metric.threshold,
    result: score.result,
    // A run below the stated dataset size cannot pass, however high its share.
    passed: score.passed,
    runAt: deps.now().toISOString(),
  };

  const run: EvaluationRun = { evaluation, failingCases: score.failingCases };
  await deps.store.save(run);
  return run;
}

/** The capability this module measures. Exported for the CLI's argument check. */
export const MEASURED_CAPABILITY: CapabilityName = 'ward_candidate';
