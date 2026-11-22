/**
 * The `NFR-051` scoring rule (`harness/scoring.ts`).
 */
import { describe, expect, it } from 'vitest';

import { scoreWardCandidate, wardCandidateCapability } from '../index.ts';
import type { WardCandidateCase } from '../index.ts';

const TOP = 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM';
const OTHER = 'wrd_01J9Z5B2C3D4E5F6G7H8J9KMP';

function labelled(count: number, confirmed: (index: number) => string | null): WardCandidateCase[] {
  return Array.from({ length: count }, (_unused, index) => ({
    caseId: `case-${index + 1}`,
    description: 'Behind Agbowo market',
    confirmedWardId: confirmed(index),
  }));
}

describe('scoreWardCandidate', () => {
  it('counts a case only when the first candidate is the confirmed ward', () => {
    const cases = labelled(2, (index) => (index === 0 ? TOP : OTHER));
    const score = scoreWardCandidate(
      cases,
      [
        { caseId: 'case-1', topWardId: TOP, outcome: 'ok', reasonCode: null },
        { caseId: 'case-2', topWardId: TOP, outcome: 'ok', reasonCode: null },
      ],
      { ...wardCandidateCapability.metric, minimumDatasetSize: 2 },
    );

    expect(score.result).toBe(0.5);
    expect(score.passed).toBe(false);
    expect(score.failingCases).toEqual([
      {
        caseId: 'case-2',
        expectedWardId: OTHER,
        topWardId: TOP,
        outcome: 'ok',
        reasonCode: null,
      },
    ]);
  });

  it('counts a case with no recorded confirmation as a miss', () => {
    const score = scoreWardCandidate(
      labelled(1, () => null),
      [{ caseId: 'case-1', topWardId: TOP, outcome: 'ok', reasonCode: null }],
      { ...wardCandidateCapability.metric, minimumDatasetSize: 1 },
    );
    expect(score.result).toBe(0);
    expect(score.failingCases).toHaveLength(1);
  });

  it('cannot pass below the judged set size, however high the share', () => {
    const cases = labelled(10, () => TOP);
    const score = scoreWardCandidate(
      cases,
      cases.map((labelledCase) => ({
        caseId: labelledCase.caseId,
        topWardId: TOP,
        outcome: 'ok' as const,
        reasonCode: null,
      })),
      wardCandidateCapability.metric,
    );

    expect(score.result).toBe(1);
    expect(score.passed).toBe(false);
  });

  it('passes at two hundred cases when the share clears seventy percent', () => {
    const cases = labelled(200, () => TOP);
    const score = scoreWardCandidate(
      cases,
      cases.map((labelledCase, index) => ({
        caseId: labelledCase.caseId,
        topWardId: index < 140 ? TOP : OTHER,
        outcome: 'ok' as const,
        reasonCode: null,
      })),
      wardCandidateCapability.metric,
    );

    expect(score.result).toBe(0.7);
    expect(score.passed).toBe(true);
    expect(score.failingCases).toHaveLength(60);
  });

  it('refuses a set and an observation list that disagree', () => {
    expect(() =>
      scoreWardCandidate(
        labelled(2, () => TOP),
        [{ caseId: 'case-1', topWardId: TOP, outcome: 'ok', reasonCode: null }],
        wardCandidateCapability.metric,
      ),
    ).toThrow(/every labelled case/);
  });
});
