/**
 * `C-056` tests: resolving or rejecting a queued description. A resolution moves the member and the
 * member's unresolved submissions without rewriting a word; a rejection leaves the member registered
 * with a stated reason.
 */
import { describe, expect, it } from 'vitest';
import { resolveWardDescription } from './resolve-ward-description.ts';
import { createWardHarness, fakeWard } from '../fakes.ts';
import type { WardCaller } from '../entities.ts';

const reviewer: WardCaller = { kind: 'staff', staffId: 'stf_STAFF1', role: 'response_staff' };

const review = {
  id: 'wdr_REVIEW1',
  memberId: 'mbr_MEMBER1',
  description: 'After the old cocoa shed, before the river',
  localGovernmentArea: 'Ibadan North',
  status: 'queued' as const,
  createdAt: '2026-11-18T09:00:00Z',
};

const submittedBody = 'The borehole at Agbowo market has been dry since March.';

function harness() {
  return createWardHarness({
    wards: [fakeWard({ id: 'wrd_AGBOWO', name: 'Ward IV, Agbowo', aliases: ['Agbowo'] })],
    members: [{ id: 'mbr_MEMBER1', wardStatus: 'unresolved', identityState: 'registered' }],
    reviews: [review],
    submissions: [
      {
        id: 'sub_1',
        reference: 'ODP-004812',
        authorId: 'mbr_MEMBER1',
        wardStatus: 'unresolved',
        locationScope: 'in_state',
        status: 'awaiting_decision',
        body: submittedBody,
      },
      {
        id: 'sub_2',
        reference: 'ODP-004799',
        authorId: 'mbr_MEMBER1',
        wardStatus: 'resolved',
        locationScope: 'in_state',
        status: 'decided',
        body: submittedBody,
      },
      {
        id: 'sub_3',
        reference: 'ODP-004900',
        authorId: 'mbr_MEMBER1',
        wardStatus: 'unresolved',
        locationScope: 'out_of_state',
        status: 'out_of_area',
        body: submittedBody,
      },
    ],
  });
}

describe('resolveWardDescription, resolved', () => {
  it('moves the member and their unresolved in-state submissions without changing the text', async () => {
    const fakes = harness();
    const result = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'resolved',
      resolvedWardId: 'wrd_AGBOWO',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toEqual({ id: 'mbr_MEMBER1', wardId: 'wrd_AGBOWO', wardStatus: 'resolved' });
    expect(result.submissionsMoved).toEqual(['ODP-004812']);
    expect(result.submissionsUnchanged).toBe(1);
    expect(fakes.submissions.map((submission) => submission.body)).toEqual([
      submittedBody,
      submittedBody,
      submittedBody,
    ]);
    expect(fakes.submissions.map((submission) => submission.wardStatus)).toEqual([
      'resolved',
      'resolved',
      'unresolved',
    ]);
    expect(fakes.reviews[0]).toMatchObject({
      status: 'resolved',
      resolvedWardId: 'wrd_AGBOWO',
      reviewerId: 'stf_STAFF1',
    });
    expect(fakes.aliasAppends).toEqual([
      { wardId: 'wrd_AGBOWO', alias: 'After the old cocoa shed, before the river' },
    ]);
    expect(fakes.audit).toHaveLength(1);
    expect(fakes.audit[0]).toMatchObject({
      actorId: 'stf_STAFF1',
      actorRole: 'response_staff',
      action: 'ward.resolved',
      entityType: 'WardDescriptionReview',
      entityId: 'wdr_REVIEW1',
    });
    expect(fakes.analytics).toEqual([
      { name: 'ward_review_resolved', properties: { resolution: 'resolved' } },
    ]);
  });
});

describe('resolveWardDescription, rejected', () => {
  it('records the reason and leaves the member unresolved', async () => {
    const fakes = harness();
    const result = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'rejected',
      rejectionReason: 'The description names two different areas; please name the nearest school.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.member).toEqual({ id: 'mbr_MEMBER1', wardStatus: 'unresolved' });
    expect(result.submissionsMoved).toEqual([]);
    expect(fakes.members[0]?.wardStatus).toBe('unresolved');
    expect(fakes.reviews[0]).toMatchObject({
      status: 'rejected',
      rejectionReason: 'The description names two different areas; please name the nearest school.',
    });
    expect(fakes.audit[0]).toMatchObject({
      action: 'ward.rejected',
      reason: 'DESCRIPTION_NOT_MATCHED',
    });
    expect(fakes.analytics).toEqual([
      { name: 'ward_review_resolved', properties: { resolution: 'rejected' } },
    ]);
  });

  it('requires a reason', async () => {
    const fakes = harness();
    const result = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'rejected',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { rejectionReason: 'REQUIRED' },
    });
  });
});

describe('resolveWardDescription refusals', () => {
  it('refuses a review that already has a decision', async () => {
    const fakes = harness();
    fakes.reviews[0] = {
      ...fakes.reviews[0]!,
      status: 'rejected',
      rejectionReason: 'not a place',
      reviewerId: 'stf_STAFF9',
      resolvedAt: '2026-11-18T10:00:00Z',
    };
    const result = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'resolved',
      resolvedWardId: 'wrd_AGBOWO',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'CONFLICT_ALREADY_DECIDED',
      cause: 'WARD_DESCRIPTION_ALREADY_RESOLVED',
    });
  });

  it('will not move a deleted account’s ward, but will still let the review be rejected', async () => {
    const fakes = harness();
    fakes.members[0] = {
      ...fakes.members[0]!,
      deletedAt: '2026-11-17T09:00:00Z',
    };

    const resolve = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'resolved',
      resolvedWardId: 'wrd_AGBOWO',
    });
    expect(resolve).toMatchObject({
      ok: false,
      code: 'POLICY_VIOLATION',
      cause: 'MEMBER_ACCOUNT_DELETED',
    });
    expect(fakes.audit).toEqual([]);

    const reject = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'rejected',
      rejectionReason: 'The account is gone; the description stays on the record.',
    });
    expect(reject.ok).toBe(true);
  });

  it('refuses an unknown ward', async () => {
    const fakes = harness();
    const result = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'resolved',
      resolvedWardId: 'wrd_MISSING',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      fields: { resolvedWardId: 'NOT_FOUND' },
    });
  });

  it('refuses a caller who is not response staff', async () => {
    const fakes = harness();
    const result = await resolveWardDescription(
      { kind: 'staff', staffId: 'stf_STAFF2', role: 'moderator' },
      fakes.ports,
      { reviewId: 'wdr_REVIEW1', status: 'rejected', rejectionReason: 'no' },
    );
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE' });
  });

  it('fails the write when the audit append fails', async () => {
    const fakes = createWardHarness({
      wards: [fakeWard({ id: 'wrd_AGBOWO', name: 'Ward IV, Agbowo' })],
      members: [{ id: 'mbr_MEMBER1', wardStatus: 'unresolved', identityState: 'registered' }],
      reviews: [review],
      auditUnavailable: true,
    });
    const result = await resolveWardDescription(reviewer, fakes.ports, {
      reviewId: 'wdr_REVIEW1',
      status: 'resolved',
      resolvedWardId: 'wrd_AGBOWO',
    });
    expect(result).toMatchObject({ ok: false, code: 'SERVICE_DEGRADED' });
  });
});
