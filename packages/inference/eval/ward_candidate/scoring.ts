/**
 * The `ward_candidate` scoring definition (`NFR-051`).
 *
 * Fixed once the labelled set was defined: the metric is the share of suggestions where the resident
 * confirms the top candidate, the bar is 70% or better, and the sample is two hundred real
 * descriptions collected during assisted intake and checked by the ward-reference reviewer. No one
 * edits a case, drops a failing case or relaxes the threshold to make a run pass
 * (`packages/inference/AGENTS.md` Discipline).
 *
 * @module eval/ward_candidate/scoring
 */

/** The judged bar for `ward_candidate`. */
export const WARD_CANDIDATE_SCORING = {
  capability: 'ward_candidate',
  metric: 'top_candidate_confirmation_rate',
  threshold: 0.7,
  minimumDatasetSize: 200,
  anchor: 'NFR-051',
  /** How a case is judged: the resident confirms the first candidate, or the run counts a miss. */
  rule: 'A case counts as confirmed only when the first candidate is the ward the reviewer recorded; a case with no recorded confirmation counts as a miss.',
} as const;
