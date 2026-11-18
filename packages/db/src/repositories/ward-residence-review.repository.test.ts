/**
 * The residence review repository (`C-057`).
 *
 * One row per review, appended with the reviewer, the method and the decision; the note is stored
 * privately and read back only for the reviewer.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createWardResidenceReviewRepository } from './ward-residence-review.repository.ts';
import { residenceReview } from '../schema/residence-review.ts';
import { createMember, createStaffUser, createTestDatabase, testId } from '../testing/index.ts';

describe('ward residence review repository', () => {
  it('records a review with its method, decision and private note', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const staffId = await createStaffUser(database.db);
      const repository = createWardResidenceReviewRepository(database.db);
      const reviewId = testId('rvd');

      await repository.record({
        id: reviewId,
        memberId,
        reviewerId: staffId,
        method: 'ward_confirmation',
        notes: 'Confirmed at the Agbowo ward meeting.',
        decision: 'checked',
        reviewedAt: '2026-01-07T10:00:00Z',
      });

      const rows = await database.db
        .select()
        .from(residenceReview)
        .where(eq(residenceReview.id, reviewId));
      expect(rows[0]).toMatchObject({
        memberId,
        reviewerId: staffId,
        method: 'ward_confirmation',
        decision: 'checked',
        notes: 'Confirmed at the Agbowo ward meeting.',
        reviewedAt: '2026-01-07T10:00:00Z',
      });
    } finally {
      await database.dispose();
    }
  });
});
