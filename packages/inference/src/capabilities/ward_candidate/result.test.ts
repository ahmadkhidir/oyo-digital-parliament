/**
 * The `ward_candidate` result rules (`C-080`).
 *
 * The capability never assigns a ward: a malformed answer produces nothing, and a well-formed one
 * produces an ordered list the caller must still ask the resident to confirm.
 */
import { describe, expect, it } from 'vitest';

import { readWardCandidateResult, type WardCandidatePayload } from './index.ts';

const payload: WardCandidatePayload = { description: 'Agbowo', candidateLimit: 3 };
const first = 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM';
const second = 'wrd_01J9Z5B2C3D4E5F6G7H8J9KMP';
const third = 'wrd_01J9Z5C3D4E5F6G7H8J9KMQ1';

describe('readWardCandidateResult', () => {
  it('orders candidates by rank', () => {
    const result = readWardCandidateResult(
      {
        candidates: [
          { wardId: second, confidence: 0.4, rank: 2 },
          { wardId: first, confidence: 0.9, rank: 1 },
        ],
      },
      payload,
    );

    expect(result).toEqual({
      candidates: [
        { wardId: first, confidence: 0.9, rank: 1 },
        { wardId: second, confidence: 0.4, rank: 2 },
      ],
    });
  });

  it('accepts an empty list as a normal answer', () => {
    expect(readWardCandidateResult({ candidates: [] }, payload)).toEqual({ candidates: [] });
  });

  it('refuses more candidates than the payload asked for', () => {
    expect(
      readWardCandidateResult(
        {
          candidates: [
            { wardId: first, confidence: 0.9, rank: 1 },
            { wardId: second, confidence: 0.4, rank: 2 },
            { wardId: third, confidence: 0.2, rank: 3 },
          ],
        },
        { ...payload, candidateLimit: 2 },
      ),
    ).toBeNull();
  });

  it('refuses a duplicate ward, a duplicate rank, a rank gap, or a confidence outside zero to one', () => {
    const duplicateWard = {
      candidates: [
        { wardId: first, confidence: 0.9, rank: 1 },
        { wardId: first, confidence: 0.4, rank: 2 },
      ],
    };
    const duplicateRank = {
      candidates: [
        { wardId: first, confidence: 0.9, rank: 1 },
        { wardId: second, confidence: 0.4, rank: 1 },
      ],
    };
    const rankGap = {
      candidates: [
        { wardId: first, confidence: 0.9, rank: 1 },
        { wardId: second, confidence: 0.4, rank: 3 },
      ],
    };
    const badConfidence = {
      candidates: [{ wardId: first, confidence: 1.4, rank: 1 }],
    };
    const badIdentifier = {
      candidates: [{ wardId: 'Ward IV', confidence: 0.9, rank: 1 }],
    };

    expect(readWardCandidateResult(duplicateWard, payload)).toBeNull();
    expect(readWardCandidateResult(duplicateRank, payload)).toBeNull();
    expect(readWardCandidateResult(rankGap, payload)).toBeNull();
    expect(readWardCandidateResult(badConfidence, payload)).toBeNull();
    expect(readWardCandidateResult(badIdentifier, payload)).toBeNull();
  });

  it('refuses anything that is not a candidates object', () => {
    expect(readWardCandidateResult(null, payload)).toBeNull();
    expect(readWardCandidateResult({ candidates: 'none' }, payload)).toBeNull();
    expect(readWardCandidateResult({ candidates: [null] }, payload)).toBeNull();
  });
});
