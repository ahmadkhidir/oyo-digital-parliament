/**
 * `C-011` tests: confirming a candidate, keeping the resident's wording, and queueing a description
 * that matched nothing. The write is only kept when its one audit record is appended.
 */
import { describe, expect, it } from 'vitest';
import { confirmWard } from './confirm-ward.ts';
import { createWardHarness, fakeWard } from '../fakes.ts';
import type { WardCaller } from '../entities.ts';

const memberCaller: WardCaller = { kind: 'member', memberId: 'mbr_MEMBER1' };
const agbowo = fakeWard({
  id: 'wrd_AGBOWO',
  name: 'Ward IV, Agbowo',
  aliases: ['Agbowo'],
});
const baseMember = {
  id: 'mbr_MEMBER1',
  wardStatus: 'unresolved' as const,
  identityState: 'registered' as const,
};

function harness(overrides: Parameters<typeof createWardHarness>[0] = {}) {
  return createWardHarness({
    wards: [agbowo],
    members: [baseMember],
    ...overrides,
  });
}

describe('confirmWard, confirmed candidate', () => {
  it('records the ward, keeps the wording as an alias, and audits once', async () => {
    const fakes = harness();
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'After the cocoa shed, before the river',
      localGovernmentArea: 'Ibadan North',
      confirmedWardId: 'wrd_AGBOWO',
      confirmedRank: 1,
    });

    expect(result).toEqual({
      ok: true,
      member: { id: 'mbr_MEMBER1', wardId: 'wrd_AGBOWO', wardStatus: 'resolved' },
      wardDescriptionReview: null,
      nextScreen: '/',
    });
    expect(fakes.members[0]).toMatchObject({ wardId: 'wrd_AGBOWO', wardStatus: 'resolved' });
    expect(fakes.aliasAppends).toEqual([
      { wardId: 'wrd_AGBOWO', alias: 'After the cocoa shed, before the river' },
    ]);
    expect(fakes.audit).toHaveLength(1);
    expect(fakes.audit[0]).toMatchObject({
      actorId: 'mbr_MEMBER1',
      actorRole: 'member',
      action: 'ward.resolved',
      entityType: 'Member',
      entityId: 'mbr_MEMBER1',
    });
    expect(fakes.analytics).toEqual([
      {
        name: 'ward_confirmed',
        properties: { ward_id: 'wrd_AGBOWO', candidate_rank: 1, source: 'fallback' },
      },
    ]);
  });

  it('does not duplicate an alias that is already known', async () => {
    const fakes = harness();
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'agbowo',
      confirmedWardId: 'wrd_AGBOWO',
    });
    expect(result.ok).toBe(true);
    expect(fakes.aliasAppends).toEqual([]);
  });

  it('never moves an existing submission when the ward is confirmed', async () => {
    const fakes = harness({
      submissions: [
        {
          id: 'sub_1',
          reference: 'ODP-004812',
          authorId: 'mbr_MEMBER1',
          wardStatus: 'unresolved',
          locationScope: 'in_state',
          status: 'awaiting_decision',
          body: 'The borehole at Agbowo market has been dry since March.',
        },
      ],
    });
    await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'Behind Agbowo market',
      confirmedWardId: 'wrd_AGBOWO',
    });
    expect(fakes.submissions[0]?.wardStatus).toBe('unresolved');
  });
});

describe('confirmWard, none of these', () => {
  it('queues the description and leaves the account usable and unresolved', async () => {
    const fakes = harness();
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'After the old cocoa shed, before the river',
      localGovernmentArea: 'Ibadan North',
      confirmedWardId: null,
      noneOfThese: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toEqual({ id: 'mbr_MEMBER1', wardStatus: 'unresolved' });
    expect(result.wardDescriptionReview).toMatchObject({ status: 'queued' });
    expect(fakes.reviews).toHaveLength(1);
    expect(fakes.reviews[0]).toMatchObject({
      memberId: 'mbr_MEMBER1',
      description: 'After the old cocoa shed, before the river',
      localGovernmentArea: 'Ibadan North',
      status: 'queued',
    });
    expect(fakes.audit).toHaveLength(1);
    expect(fakes.audit[0]).toMatchObject({
      action: 'ward.sent_for_review',
      entityType: 'WardDescriptionReview',
    });
    expect(fakes.analytics).toEqual([
      { name: 'ward_sent_for_review', properties: { lga_matched: true } },
    ]);
  });

  it('keeps a ward that is already recorded when a new description is queued', async () => {
    const fakes = harness({
      members: [{ ...baseMember, wardId: 'wrd_AGBOWO', wardStatus: 'resolved' }],
    });
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'Somewhere else entirely',
      noneOfThese: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toEqual({
      id: 'mbr_MEMBER1',
      wardId: 'wrd_AGBOWO',
      wardStatus: 'resolved',
    });
    expect(fakes.audit[0]).toMatchObject({
      action: 'ward.sent_for_review',
      entityId: fakes.reviews[0]?.id,
    });
  });
});

describe('confirmWard refusals', () => {
  it('refuses another member’s identifier', async () => {
    const fakes = harness();
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_OTHER1',
      description: 'Agbowo',
      confirmedWardId: 'wrd_AGBOWO',
    });
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE', cause: 'MEMBER_MISMATCH' });
    expect(fakes.audit).toEqual([]);
  });

  it('refuses an unknown ward', async () => {
    const fakes = harness();
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'Agbowo',
      confirmedWardId: 'wrd_MISSING',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      cause: 'WARD_NOT_FOUND',
      fields: { confirmedWardId: 'NOT_FOUND' },
    });
  });

  it('refuses a blank description', async () => {
    const fakes = harness();
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: '  ',
      confirmedWardId: 'wrd_AGBOWO',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { description: 'REQUIRED' },
    });
  });

  it('requires a choice when no ward is confirmed and "none of these" is absent', async () => {
    const fakes = harness();
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'Agbowo',
      confirmedWardId: null,
    });
    expect(result).toMatchObject({ ok: false, cause: 'WARD_CHOICE_REQUIRED' });
  });
});

describe('confirmWard when the reference is unavailable', () => {
  it('accepts the free-text description and queues it', async () => {
    const fakes = harness({ referenceUnavailable: true });
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'Behind the old cocoa shed',
      confirmedWardId: 'wrd_AGBOWO',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member.wardStatus).toBe('unresolved');
    expect(result.wardDescriptionReview).toMatchObject({ status: 'queued' });
    expect(fakes.reviews).toHaveLength(1);
  });
});

describe('confirmWard audit and analytics failure', () => {
  it('fails the write when the audit append fails', async () => {
    const fakes = harness({ auditUnavailable: true });
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'Agbowo',
      confirmedWardId: 'wrd_AGBOWO',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'AUDIT_APPEND_FAILED',
    });
  });

  it('keeps the write when analytics cannot take the event', async () => {
    const fakes = harness({ analyticsUnavailable: true });
    const result = await confirmWard(memberCaller, fakes.ports, {
      memberId: 'mbr_MEMBER1',
      description: 'Agbowo',
      confirmedWardId: 'wrd_AGBOWO',
    });
    expect(result.ok).toBe(true);
  });
});
