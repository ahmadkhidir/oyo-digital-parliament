/**
 * The candidate suggestion boundary's tests (`C-010`, `FEAT-002`, `NFR-014`, `EVT-006`).
 *
 * The route handler is thin; the parsing and the mapping from the domain's answer are what decide
 * the candidate state the screen renders and what a caller receives. The suite proves the
 * deterministic fallback is printed unchanged and that an empty list is a normal answer, because an
 * empty answer is what sends the resident to the review queue without blocking them.
 */
import { describe, expect, it } from 'vitest';
import { wardFailure, type WardCaller } from '@odp/domain';
import { parseCandidatesRequest, processCandidates, type CandidatesRunner } from './candidates';

const MEMBER: WardCaller = { kind: 'member', memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' };

describe('parseCandidatesRequest (C-010 request)', () => {
  it('reads the description and the area', () => {
    expect(
      parseCandidatesRequest({
        description: 'Behind Agbowo market',
        localGovernmentArea: 'Ibadan North',
      }),
    ).toEqual({
      ok: true,
      request: { description: 'Behind Agbowo market', localGovernmentArea: 'Ibadan North' },
    });
  });

  it('accepts an absent local government area', () => {
    expect(parseCandidatesRequest({ description: 'Agbowo' })).toEqual({
      ok: true,
      request: { description: 'Agbowo', localGovernmentArea: '' },
    });
  });

  it('requires the description', () => {
    const parsed = parseCandidatesRequest({ description: '   ' });
    expect(parsed).toMatchObject({
      ok: false,
      failure: { code: 'VALIDATION_FAILED', fields: { description: 'REQUIRED' } },
    });
  });

  it('refuses a description beyond the column', () => {
    const parsed = parseCandidatesRequest({ description: 'a'.repeat(501) });
    expect(parsed).toMatchObject({
      ok: false,
      failure: { fields: { description: 'TOO_LONG' } },
    });
  });

  it('refuses a non-string area', () => {
    const parsed = parseCandidatesRequest({ description: 'Agbowo', localGovernmentArea: 12 });
    expect(parsed).toMatchObject({
      ok: false,
      failure: { fields: { localGovernmentArea: 'PATTERN_MISMATCH' } },
    });
  });

  it('refuses a body that is not an object', () => {
    const parsed = parseCandidatesRequest(null);
    expect(parsed).toMatchObject({ ok: false, failure: { cause: 'REQUEST_BODY_INVALID' } });
  });
});

describe('processCandidates (C-010 answer)', () => {
  it('refuses a caller with no member session', async () => {
    const runner: CandidatesRunner = {
      run: async () => ({
        ok: true,
        candidates: [],
        capabilityStatus: 'fallback',
        confirmationRequired: true,
      }),
    };
    const outcome = await processCandidates(runner, null, {
      description: 'Agbowo',
      localGovernmentArea: '',
    });
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'UNAUTHENTICATED', cause: 'MEMBER_SESSION_REQUIRED' },
    });
  });

  it('prints the deterministic fallback and its candidates unchanged', async () => {
    const runner: CandidatesRunner = {
      async run() {
        return {
          ok: true,
          candidates: [
            {
              wardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
              name: 'Ward IV, Agbowo',
              localGovernmentArea: 'Ibadan North',
              rank: 1,
              source: 'alias',
            },
          ],
          capabilityStatus: 'fallback',
          confirmationRequired: true,
        };
      },
    };
    const outcome = await processCandidates(runner, MEMBER, {
      description: 'Agbowo',
      localGovernmentArea: 'Ibadan North',
    });
    expect(outcome).toEqual({
      ok: true,
      answer: {
        candidates: [
          {
            wardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
            name: 'Ward IV, Agbowo',
            localGovernmentArea: 'Ibadan North',
            rank: 1,
            source: 'alias',
          },
        ],
        capabilityStatus: 'fallback',
        confirmationRequired: true,
      },
    });
  });

  it('treats no candidates as a normal answer, never a refusal', async () => {
    const runner: CandidatesRunner = {
      async run() {
        return {
          ok: true,
          candidates: [],
          capabilityStatus: 'fallback',
          confirmationRequired: true,
        };
      },
    };
    const outcome = await processCandidates(runner, MEMBER, {
      description: 'After the old cocoa shed',
      localGovernmentArea: '',
    });
    expect(outcome).toMatchObject({
      ok: true,
      answer: { candidates: [], capabilityStatus: 'fallback' },
    });
  });

  it('passes the reference-unavailable refusal through for the screen’s error state', async () => {
    const runner: CandidatesRunner = {
      async run() {
        return wardFailure(
          'SERVICE_DEGRADED',
          'WARD_REFERENCE_UNAVAILABLE',
          'The ward list could not be read.',
        );
      },
    };
    const outcome = await processCandidates(runner, MEMBER, {
      description: 'Agbowo',
      localGovernmentArea: '',
    });
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: 'SERVICE_DEGRADED', cause: 'WARD_REFERENCE_UNAVAILABLE' },
    });
  });
});
