/**
 * The stored scoring definition must match the capability's judged bar (`NFR-051`).
 *
 * `eval/` is the record a reviewer reads; a drift between it and the registered capability is how a
 * threshold gets quietly moved, so the two are asserted equal.
 */
import { describe, expect, it } from 'vitest';

import { wardCandidateCapability } from '../../src/index.ts';
import { WARD_CANDIDATE_SCORING } from './scoring.ts';

describe('ward_candidate scoring definition', () => {
  it('matches the registered capability bar', () => {
    expect(WARD_CANDIDATE_SCORING.capability).toBe(wardCandidateCapability.name);
    expect(WARD_CANDIDATE_SCORING.metric).toBe(wardCandidateCapability.metric.id);
    expect(WARD_CANDIDATE_SCORING.threshold).toBe(wardCandidateCapability.metric.threshold);
    expect(WARD_CANDIDATE_SCORING.minimumDatasetSize).toBe(
      wardCandidateCapability.metric.minimumDatasetSize,
    );
    expect(WARD_CANDIDATE_SCORING.anchor).toBe(wardCandidateCapability.metric.anchor);
  });

  it('states the bar NFR-051 fixes', () => {
    expect(WARD_CANDIDATE_SCORING.threshold).toBe(0.7);
    expect(WARD_CANDIDATE_SCORING.minimumDatasetSize).toBe(200);
  });
});
