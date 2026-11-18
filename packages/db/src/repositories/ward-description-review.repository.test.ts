/**
 * The description queue repository (`C-055`, `C-056`).
 *
 * Proves the oldest-first order, the member context the reviewer sees (including a deleted account),
 * the submission references a resolution will move, and the conditional write that makes a second
 * decision a lost race rather than an overwrite.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createWardDescriptionReviewRepository } from './ward-description-review.repository.ts';
import { member } from '../schema/member.ts';
import {
  T0,
  createMember,
  createStaffUser,
  createSubmission,
  createTestDatabase,
  createWard,
  testId,
} from '../testing/index.ts';

async function queues() {
  const database = await createTestDatabase();
  const wardId = await createWard(database.db, { name: 'Ward IV, Agbowo' });
  const memberId = await createMember(database.db);
  const staffId = await createStaffUser(database.db);
  const submissionId = await createSubmission(database.db, { authorId: memberId });
  const repository = createWardDescriptionReviewRepository(database.db);
  return { database, wardId, memberId, staffId, submissionId, repository };
}

describe('ward description review repository', () => {
  it('records a queued description and reads it back', async () => {
    const { database, memberId, repository } = await queues();
    try {
      const reviewId = testId('wdr');
      await repository.create({
        id: reviewId,
        memberId,
        description: 'After the old cocoa shed, before the river',
        localGovernmentArea: 'Ibadan North',
        status: 'queued',
        createdAt: T0,
      });

      const found = await repository.findById(reviewId);
      expect(found).toMatchObject({
        id: reviewId,
        memberId,
        description: 'After the old cocoa shed, before the river',
        localGovernmentArea: 'Ibadan North',
        status: 'queued',
      });
      expect(await repository.findById('wdr_UNKNOWN1')).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('reads the queue oldest first with member state and unresolved references', async () => {
    const { database, memberId, submissionId, repository } = await queues();
    try {
      const later = testId('wdr');
      const earlier = testId('wdr');
      await repository.create({
        id: later,
        memberId,
        description: 'Second words',
        status: 'queued',
        createdAt: '2026-01-02T00:00:00Z',
      });
      await repository.create({
        id: earlier,
        memberId,
        submissionId,
        description: 'First words',
        status: 'queued',
        createdAt: '2026-01-01T00:00:00Z',
      });

      const page = await repository.listQueue({ status: 'queued', limit: 20 });
      expect(page.reviews.map((entry) => entry.review.id)).toEqual([earlier, later]);
      expect(page.reviews[0]?.member).toMatchObject({
        id: memberId,
        wardStatus: 'unresolved',
        identityState: 'registered',
        deleted: false,
      });
      expect(page.reviews[0]?.submissionReferences).toHaveLength(1);
      expect(await repository.countQueued()).toBe(2);
    } finally {
      await database.dispose();
    }
  });

  it('reports a deleted account as deleted and can still list its review', async () => {
    const { database, memberId, repository } = await queues();
    try {
      await database.db
        .update(member)
        .set({ deletedAt: '2026-01-03T00:00:00Z' })
        .where(eq(member.id, memberId));
      await repository.create({
        id: testId('wdr'),
        memberId,
        description: 'Somewhere near the river',
        status: 'queued',
        createdAt: T0,
      });

      const page = await repository.listQueue({ status: 'queued', limit: 20 });
      expect(page.reviews[0]?.member?.deleted).toBe(true);
    } finally {
      await database.dispose();
    }
  });

  it('marks a resolution and a rejection as conditional writes', async () => {
    const { database, wardId, memberId, staffId, repository } = await queues();
    try {
      const reviewId = testId('wdr');
      await repository.create({
        id: reviewId,
        memberId,
        description: 'Behind Agbowo market',
        status: 'queued',
        createdAt: T0,
      });

      const resolved = await repository.markResolved({
        reviewId,
        wardId,
        reviewerId: staffId,
        resolvedAt: '2026-01-04T00:00:00Z',
      });
      expect(resolved).toBe(true);

      const second = await repository.markRejected({
        reviewId,
        rejectionReason: 'Already settled.',
        reviewerId: staffId,
        resolvedAt: '2026-01-05T00:00:00Z',
      });
      expect(second).toBe(false);

      const stored = await repository.findById(reviewId);
      expect(stored).toMatchObject({
        status: 'resolved',
        resolvedWardId: wardId,
        reviewerId: staffId,
        resolvedAt: '2026-01-04T00:00:00Z',
      });
      expect(await repository.countQueued()).toBe(0);

      // A second queued row can be rejected and keeps its stated reason.
      const rejectedId = testId('wdr');
      await repository.create({
        id: rejectedId,
        memberId,
        description: 'After the school',
        status: 'queued',
        createdAt: T0,
      });
      expect(
        await repository.markRejected({
          reviewId: rejectedId,
          rejectionReason: 'The description names two different areas.',
          reviewerId: staffId,
          resolvedAt: '2026-01-06T00:00:00Z',
        }),
      ).toBe(true);
      expect((await repository.findById(rejectedId))?.rejectionReason).toBe(
        'The description names two different areas.',
      );
    } finally {
      await database.dispose();
    }
  });
});
