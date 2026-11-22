/**
 * The `ward_candidate` payload rules (`C-080`, `C-010`).
 */
import { describe, expect, it } from 'vitest';

import { readWardCandidatePayload, WARD_DESCRIPTION_MAX_LENGTH } from './index.ts';

describe('readWardCandidatePayload', () => {
  it('defaults the candidate limit to three', () => {
    const read = readWardCandidatePayload({ description: 'Behind Agbowo market' });
    expect(read).toEqual({
      ok: true,
      value: { description: 'Behind Agbowo market', candidateLimit: 3 },
    });
  });

  it('keeps the local government area and the resident wording verbatim', () => {
    const read = readWardCandidatePayload({
      description: '  Behind Agbowo market, near the express  ',
      localGovernmentArea: 'Ibadan North',
      candidateLimit: 2,
    });
    expect(read).toEqual({
      ok: true,
      value: {
        description: '  Behind Agbowo market, near the express  ',
        localGovernmentArea: 'Ibadan North',
        candidateLimit: 2,
      },
    });
  });

  it('refuses a missing or empty description', () => {
    expect(readWardCandidatePayload({})).toEqual({
      ok: false,
      fields: { description: 'REQUIRED' },
    });
    expect(readWardCandidatePayload({ description: '   ' })).toEqual({
      ok: false,
      fields: { description: 'REQUIRED' },
    });
  });

  it('refuses a description longer than the contract prints', () => {
    const read = readWardCandidatePayload({
      description: 'a'.repeat(WARD_DESCRIPTION_MAX_LENGTH + 1),
    });
    expect(read).toEqual({ ok: false, fields: { description: 'TOO_LONG' } });
  });

  it('refuses a candidate limit outside one to three', () => {
    expect(readWardCandidatePayload({ description: 'Agbowo', candidateLimit: 4 })).toEqual({
      ok: false,
      fields: { candidateLimit: 'OUT_OF_BAND' },
    });
    expect(readWardCandidatePayload({ description: 'Agbowo', candidateLimit: 0 })).toEqual({
      ok: false,
      fields: { candidateLimit: 'OUT_OF_BAND' },
    });
  });

  it('refuses an empty local government area when one was supplied', () => {
    expect(readWardCandidatePayload({ description: 'Agbowo', localGovernmentArea: '' })).toEqual({
      ok: false,
      fields: { localGovernmentArea: 'REQUIRED' },
    });
  });
});
