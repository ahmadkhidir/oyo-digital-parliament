/**
 * `C-055` tests: the reviewer's queue. It reads descriptions oldest first with the member's state,
 * and it never resolves anything itself.
 */
import { describe, expect, it } from 'vitest';
import { readWardReviewQueue } from './read-ward-review-queue.ts';
import { recordResidenceReview } from './record-residence-review.ts';
import { createWardHarness, fakeWard } from '../fakes.ts';
import type { WardCaller } from '../entities.ts';

const reviewer: WardCaller = { kind: 'staff', staffId: 'stf_STAFF1', role: 'response_staff' };

const reviewBase = {
  memberId: 'mbr_MEMBER1',
  description: 'After the old cocoa shed, before the river',
  localGovernmentArea: 'Ibadan North',
  status: 'queued' as const,
};

const fakes = () =>
  createWardHarness({
    wards: [
      fakeWard({ id: 'wrd_AGBOWO', name: 'Ward IV, Agbowo' }),
      fakeWard({ id: 'wrd_BODIJA', name: 'Ward V, Bodija' }),
      fakeWard({ id: 'wrd_OKE', name: 'Ward I, Oke Afin', localGovernmentArea: 'Atiba' }),
    ],
    members: [{ id: 'mbr_MEMBER1', wardStatus: 'unresolved', identityState: 'registered' }],
    submissions: [
      {
        id: 'sub_1',
        reference: 'ODP-004812',
        authorId: 'mbr_MEMBER1',
        wardStatus: 'unresolved',
        locationScope: 'in_state',
        status: 'awaiting_decision',
        body: 'The drain behind the school floods every rainy season.',
      },
    ],
    reviews: [
      { ...reviewBase, id: 'wdr_LATER', createdAt: '2026-11-18T10:00:00Z' },
      { ...reviewBase, id: 'wdr_EARLIER', createdAt: '2026-11-18T09:00:00Z' },
    ],
  });

describe('readWardReviewQueue', () => {
  it('defaults to the unchanged descriptions queue and names its work type', async () => {
    const harness = fakes();
    const result = await readWardReviewQueue(reviewer, harness.ports, { status: 'queued' });
    expect(result.ok).toBe(true);
    if (!result.ok || result.work !== 'descriptions') return;
    expect(result.work).toBe('descriptions');
    expect(result.reviews.map((entry) => entry.review.id)).toEqual(['wdr_EARLIER', 'wdr_LATER']);
    expect(result.reviews[0]?.member).toEqual({
      id: 'mbr_MEMBER1',
      identityState: 'registered',
      wardStatus: 'unresolved',
      deleted: false,
    });
    expect(result.reviews[0]?.submissionReferences).toEqual(['ODP-004812']);
    expect(result.queuedCount).toBe(2);
  });

  it('offers the wards of the areas represented on the page', async () => {
    const harness = fakes();
    const result = await readWardReviewQueue(reviewer, harness.ports, {
      localGovernmentArea: 'Ibadan North',
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.work !== 'descriptions') return;
    expect(result.candidateWards.map((ward) => ward.id)).toEqual(['wrd_AGBOWO', 'wrd_BODIJA']);
  });

  it('refuses a role that is not response staff', async () => {
    const harness = fakes();
    const result = await readWardReviewQueue(
      { kind: 'staff', staffId: 'stf_STAFF2', role: 'moderator' },
      harness.ports,
    );
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE' });
  });

  it('refuses a status outside the enum', async () => {
    const harness = fakes();
    const result = await readWardReviewQueue(reviewer, harness.ports, {
      status: 'open' as never,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { status: 'ENUM_MISMATCH' },
    });
  });

  it('reports an unreadable queue as degraded', async () => {
    const harness = fakes();
    harness.ports.wardDescriptionReviews.listQueue = async () => {
      throw new Error('queue unavailable');
    };
    const result = await readWardReviewQueue(reviewer, harness.ports);
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'WARD_REVIEW_QUEUE_UNAVAILABLE',
    });
  });

  it('refuses a work type outside the two the route carries', async () => {
    const harness = fakes();
    const result = await readWardReviewQueue(reviewer, harness.ports, {
      work: 'residents' as never,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { work: 'ENUM_MISMATCH' },
    });
  });
});

/** A queue with every residence state the read must separate. */
function residenceFakes() {
  return createWardHarness({
    wards: [fakeWard({ id: 'wrd_AGBOWO', name: 'Ward IV, Agbowo' })],
    members: [
      {
        id: 'mbr_LATER',
        wardId: 'wrd_AGBOWO',
        wardStatus: 'resolved',
        identityState: 'registered',
        displayName: 'Seun A.',
        createdAt: '2026-11-19T09:00:00Z',
      },
      {
        id: 'mbr_EARLIER',
        wardId: 'wrd_AGBOWO',
        wardStatus: 'resolved',
        identityState: 'registered',
        displayName: 'Bola O.',
        createdAt: '2026-11-18T09:00:00Z',
      },
      {
        id: 'mbr_CHECKED',
        wardId: 'wrd_AGBOWO',
        wardStatus: 'resolved',
        identityState: 'checked',
        createdAt: '2026-11-17T09:00:00Z',
      },
      {
        id: 'mbr_UNRESOLVED',
        wardStatus: 'unresolved',
        identityState: 'registered',
        createdAt: '2026-11-16T09:00:00Z',
      },
      {
        id: 'mbr_DELETED',
        wardId: 'wrd_AGBOWO',
        wardStatus: 'resolved',
        identityState: 'registered',
        deletedAt: '2026-11-20T09:00:00Z',
        createdAt: '2026-11-15T09:00:00Z',
      },
    ],
  });
}

describe('readWardReviewQueue, residences (FEAT-001, C-055)', () => {
  it('lists resolved members whose residence is not accepted, oldest registration first', async () => {
    const harness = residenceFakes();
    const result = await readWardReviewQueue(reviewer, harness.ports, { work: 'residences' });

    expect(result.ok).toBe(true);
    if (!result.ok || result.work !== 'residences') return;
    expect(result.residences.map((residence) => residence.memberId)).toEqual([
      'mbr_EARLIER',
      'mbr_LATER',
    ]);
    expect(result.residenceCount).toBe(2);
    expect(result.residences[0]).toEqual({
      memberId: 'mbr_EARLIER',
      displayName: 'Bola O.',
      wardId: 'wrd_AGBOWO',
      wardName: 'Ward IV, Agbowo',
      registeredAt: '2026-11-18T09:00:00Z',
    });
  });

  it('carries the display name and ward only, never a real name, number or age', async () => {
    const harness = residenceFakes();
    const result = await readWardReviewQueue(reviewer, harness.ports, { work: 'residences' });
    if (!result.ok || result.work !== 'residences') throw new Error('the queue did not answer');

    expect(Object.keys(result.residences[0] ?? {}).sort()).toEqual([
      'displayName',
      'memberId',
      'registeredAt',
      'wardId',
      'wardName',
    ]);
  });

  it('removes a member from the list once the residence review is accepted', async () => {
    const harness = residenceFakes();
    const review = await recordResidenceReview(reviewer, harness.ports, {
      memberId: 'mbr_EARLIER',
      method: 'ward_confirmation',
      decision: 'checked',
    });
    expect(review.ok).toBe(true);

    const result = await readWardReviewQueue(reviewer, harness.ports, { work: 'residences' });
    if (!result.ok || result.work !== 'residences') throw new Error('the queue did not answer');
    expect(result.residences.map((residence) => residence.memberId)).toEqual(['mbr_LATER']);
    expect(result.residenceCount).toBe(1);
  });

  it('keeps a refused member Registered and on the list', async () => {
    const harness = residenceFakes();
    const review = await recordResidenceReview(reviewer, harness.ports, {
      memberId: 'mbr_EARLIER',
      method: 'document',
      decision: 'rejected',
      notes: 'The document does not show the street address.',
    });
    expect(review.ok).toBe(true);

    const result = await readWardReviewQueue(reviewer, harness.ports, { work: 'residences' });
    if (!result.ok || result.work !== 'residences') throw new Error('the queue did not answer');
    expect(result.residences.map((residence) => residence.memberId)).toEqual([
      'mbr_EARLIER',
      'mbr_LATER',
    ]);
    expect(harness.members.find((member) => member.id === 'mbr_EARLIER')?.identityState).toBe(
      'registered',
    );
  });

  it('pages the list and reports an unreadable residence queue as degraded', async () => {
    const harness = residenceFakes();
    const first = await readWardReviewQueue(reviewer, harness.ports, {
      work: 'residences',
      limit: 1,
    });
    if (!first.ok || first.work !== 'residences') throw new Error('the queue did not answer');
    expect(first.residences.map((residence) => residence.memberId)).toEqual(['mbr_EARLIER']);
    expect(first.nextCursor).not.toBeNull();

    const second = await readWardReviewQueue(reviewer, harness.ports, {
      work: 'residences',
      limit: 1,
      ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
    });
    if (!second.ok || second.work !== 'residences') throw new Error('the queue did not answer');
    expect(second.residences.map((residence) => residence.memberId)).toEqual(['mbr_LATER']);
    expect(second.nextCursor).toBeNull();

    harness.ports.residenceReviews.listPending = async () => {
      throw new Error('the member store is unavailable');
    };
    const degraded = await readWardReviewQueue(reviewer, harness.ports, { work: 'residences' });
    expect(degraded).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'WARD_REVIEW_QUEUE_UNAVAILABLE',
    });
  });
});
