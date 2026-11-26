/**
 * `C-057` tests: the residence review is the only route from Registered to Checked, a rejection
 * leaves the member exactly where they were, and a rejection that states no reason is refused before
 * anything is written.
 */
import { describe, expect, it } from 'vitest';
import { recordResidenceReview } from './record-residence-review.ts';
import { createWardHarness, fakeWard } from '../fakes.ts';
import type { WardCaller } from '../entities.ts';

const reviewer: WardCaller = { kind: 'staff', staffId: 'stf_STAFF1', role: 'response_staff' };
const ward = fakeWard({ id: 'wrd_AGBOWO', name: 'Ward IV, Agbowo' });

function harness(overrides: Parameters<typeof createWardHarness>[0] = {}) {
  return createWardHarness({
    wards: [ward],
    members: [
      {
        id: 'mbr_MEMBER1',
        wardId: ward.id,
        wardStatus: 'resolved',
        identityState: 'registered',
      },
    ],
    backings: 3,
    ...overrides,
  });
}

describe('recordResidenceReview, accepted', () => {
  it('moves the member to checked and records one review with one audit event', async () => {
    const fakes = harness();
    const result = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'ward_confirmation',
      decision: 'checked',
      notes: 'Confirmed at the Agbowo ward meeting.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toEqual({ identityState: 'checked' });
    expect(result.backingsUpdated).toBe(3);
    expect(result.residenceReview).toMatchObject({
      memberId: 'mbr_MEMBER1',
      reviewerId: 'stf_STAFF1',
      method: 'ward_confirmation',
      decision: 'checked',
    });
    expect(fakes.members[0]?.identityState).toBe('checked');
    expect(fakes.residenceReviews).toHaveLength(1);
    expect(fakes.audit).toHaveLength(1);
    expect(fakes.audit[0]).toMatchObject({
      actorId: 'stf_STAFF1',
      action: 'residence.reviewed',
      entityType: 'ResidenceReview',
    });
    expect(fakes.analytics).toEqual([
      {
        name: 'residence_review_completed',
        properties: { decision: 'checked', method: 'ward_confirmation' },
      },
      {
        name: 'identity_state_changed',
        properties: { from_state: 'registered', to_state: 'checked' },
      },
    ]);
  });

  it('records without a reason, because a note is not required on an acceptance', async () => {
    const fakes = harness();
    const result = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'ward_confirmation',
      decision: 'checked',
    });

    expect(result.ok).toBe(true);
    expect(fakes.residenceReviews[0]).not.toHaveProperty('notes');
    expect(fakes.members[0]?.identityState).toBe('checked');
  });
});

describe('recordResidenceReview, rejected', () => {
  it('leaves the member registered with the reason on the record', async () => {
    const fakes = harness();
    const result = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'document',
      decision: 'rejected',
      notes: 'No document shows the street address.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toEqual({ identityState: 'registered' });
    expect(result.backingsUpdated).toBe(0);
    expect(fakes.members[0]?.identityState).toBe('registered');
    expect(fakes.residenceReviews[0]).toMatchObject({
      decision: 'rejected',
      notes: 'No document shows the street address.',
    });
    expect(fakes.analytics).toEqual([
      {
        name: 'residence_review_completed',
        properties: { decision: 'rejected', method: 'document' },
      },
    ]);
  });
});

describe('recordResidenceReview refusals', () => {
  it('refuses a rejection with no stated reason and writes nothing', async () => {
    const fakes = harness();
    const missing = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'document',
      decision: 'rejected',
    });
    expect(missing).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'RESIDENCE_REVIEW_INVALID',
      fields: { notes: 'REQUIRED' },
    });

    const blank = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'document',
      decision: 'rejected',
      notes: '   ',
    });
    expect(blank).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { notes: 'REQUIRED' },
    });

    expect(fakes.residenceReviews).toEqual([]);
    expect(fakes.members[0]?.identityState).toBe('registered');
    expect(fakes.audit).toEqual([]);
    expect(fakes.analytics).toEqual([]);
  });

  it('refuses to check a residence whose ward is not recorded', async () => {
    const fakes = harness({
      members: [{ id: 'mbr_MEMBER1', wardStatus: 'unresolved', identityState: 'registered' }],
    });
    const result = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'ward_confirmation',
      decision: 'checked',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'POLICY_VIOLATION',
      cause: 'WARD_UNRESOLVED',
    });
    expect(fakes.residenceReviews).toEqual([]);
  });

  it('refuses a note longer than the field', async () => {
    const fakes = harness();
    const result = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'ward_confirmation',
      decision: 'checked',
      notes: 'a'.repeat(1001),
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { notes: 'TOO_LONG' },
    });
  });

  it('refuses an unknown method and an unknown member', async () => {
    const fakes = harness();
    const method = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      method: 'phone_call' as never,
      decision: 'checked',
    });
    expect(method).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { method: 'ENUM_MISMATCH' },
    });

    const member = await recordResidenceReview(reviewer, fakes.ports, {
      memberId: 'mbr_MISSING1',
      method: 'ward_confirmation',
      decision: 'checked',
    });
    expect(member).toMatchObject({ ok: false, code: 'NOT_FOUND', cause: 'MEMBER_NOT_FOUND' });
  });

  it('refuses a caller who is not response staff', async () => {
    const fakes = harness();
    const result = await recordResidenceReview(
      { kind: 'staff', staffId: 'stf_STAFF2', role: 'moderator' },
      fakes.ports,
      { memberId: 'mbr_MEMBER1', method: 'ward_confirmation', decision: 'rejected' },
    );
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE' });
  });
});
