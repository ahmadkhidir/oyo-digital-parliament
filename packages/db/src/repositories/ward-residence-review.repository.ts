/**
 * The residence review's persistence adapter (`schema.md` ResidenceReview, `C-057`).
 *
 * One row per review, append-only in practice: a later review is a new row and the latest one is what
 * the member's identity state reflects. `notes` is the reviewer's private working note and is never
 * selected by a public projection.
 */
import type { ResidenceReview, ResidenceReviewPort } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { residenceReview } from '../schema/residence-review.ts';

/** One repository implements the residence-review port. */
export type WardResidenceReviewRepository = ResidenceReviewPort;

/**
 * Builds the residence-review repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the review is already inside.
 */
export function createWardResidenceReviewRepository(
  executor: Executor,
): WardResidenceReviewRepository {
  const db = executorOf(executor);

  return {
    async record(review: ResidenceReview) {
      await db.insert(residenceReview).values({
        id: review.id,
        memberId: review.memberId,
        reviewerId: review.reviewerId,
        method: review.method,
        notes: review.notes ?? null,
        decision: review.decision,
        reviewedAt: review.reviewedAt,
      });
    },
  };
}
