/**
 * `C-055` tests: the reviewer's queue. It reads descriptions oldest first with the member's state,
 * and it never resolves anything itself.
 */
import { describe, expect, it } from 'vitest';
import { readWardReviewQueue } from './read-ward-review-queue.ts';
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
  it('reads queued descriptions oldest first with the member context', async () => {
    const harness = fakes();
    const result = await readWardReviewQueue(reviewer, harness.ports, { status: 'queued' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
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
    if (!result.ok) return;
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
});
