/**
 * `C-010` tests: the deterministic candidate path. This task does not wire the model capability, so
 * every answer is the fallback, and an empty list is a normal answer rather than a refusal.
 */
import { describe, expect, it } from 'vitest';
import { suggestWardCandidates } from './suggest-ward-candidates.ts';
import { createWardHarness, fakeWard } from '../fakes.ts';
import type { WardCaller } from '../entities.ts';

const memberCaller: WardCaller = { kind: 'member', memberId: 'mbr_MEMBER1' };

const wards = [
  fakeWard({ id: 'wrd_AGBOWO', name: 'Ward IV, Agbowo', aliases: ['Agbowo'] }),
  fakeWard({ id: 'wrd_BODIJA', name: 'Ward V, Bodija' }),
  fakeWard({ id: 'wrd_AWE1', name: 'Ward I, Awe', localGovernmentArea: 'Afijio' }),
  fakeWard({ id: 'wrd_AWE2', name: 'Ward I, Awe', localGovernmentArea: 'Atiba' }),
];

describe('suggestWardCandidates', () => {
  it('offers up to three candidates from the deterministic fallback', async () => {
    const fakes = createWardHarness({ wards });
    const result = await suggestWardCandidates(memberCaller, fakes.ports, {
      description: 'Behind Agbowo market, near the express',
      localGovernmentArea: 'Ibadan North',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.capabilityStatus).toBe('fallback');
    expect(result.confirmationRequired).toBe(true);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
    expect(result.candidates[0]).toMatchObject({ wardId: 'wrd_AGBOWO', rank: 1 });
    expect(fakes.analytics).toEqual([
      {
        name: 'ward_candidate_suggested',
        properties: { candidate_count: result.candidates.length, source: 'fallback' },
      },
    ]);
  });

  it('asks for the local government area when a ward name is shared', async () => {
    const fakes = createWardHarness({ wards });
    const result = await suggestWardCandidates(memberCaller, fakes.ports, {
      description: 'Awe',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'WARD_AREA_REQUIRED',
      fields: { localGovernmentArea: 'REQUIRED' },
    });
  });

  it('answers with no candidates when nothing resembles the description', async () => {
    const fakes = createWardHarness({ wards });
    const result = await suggestWardCandidates(memberCaller, fakes.ports, {
      description: 'After the old cocoa shed, before the river',
    });
    expect(result).toMatchObject({ ok: true, candidates: [], capabilityStatus: 'fallback' });
    expect(fakes.reviews).toEqual([]);
  });

  it('refuses a description longer than the field', async () => {
    const fakes = createWardHarness({ wards });
    const result = await suggestWardCandidates(memberCaller, fakes.ports, {
      description: 'a'.repeat(501),
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { description: 'TOO_LONG' },
    });
  });

  it('refuses a session that is not the member’s', async () => {
    const fakes = createWardHarness({ wards });
    const publicResult = await suggestWardCandidates({ kind: 'public' }, fakes.ports, {
      description: 'Agbowo',
    });
    expect(publicResult).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });

    const staffResult = await suggestWardCandidates(
      { kind: 'staff', staffId: 'stf_STAFF1', role: 'response_staff' },
      fakes.ports,
      { description: 'Agbowo' },
    );
    expect(staffResult).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE' });
  });

  it('reports the reference as unavailable rather than guessing', async () => {
    const fakes = createWardHarness({ wards, referenceUnavailable: true });
    const result = await suggestWardCandidates(memberCaller, fakes.ports, {
      description: 'Agbowo',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'WARD_REFERENCE_UNAVAILABLE',
    });
  });
});
