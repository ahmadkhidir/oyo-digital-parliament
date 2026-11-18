/**
 * The description queue's persistence adapter (`schema.md` WardDescriptionReview, `C-055`, `C-056`).
 *
 * `description` and `rejection_reason` are personal free text. They are read for the reviewer's queue
 * and written by the resident's own action; nothing here selects them into a public query, an audit
 * row or a search document (`packages/db/AGENTS.md` Discipline).
 *
 * A resolution is a conditional write on `status = 'queued'`: two reviewers settling the same case
 * is a lost race that the caller reports as `CONFLICT_ALREADY_DECIDED`, never a silent overwrite.
 */
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type {
  QueuedWardDescriptionReview,
  WardDescriptionReview,
  WardDescriptionReviewPort,
} from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { member } from '../schema/member.ts';
import { submission } from '../schema/submission.ts';
import { wardDescriptionReview } from '../schema/ward-description-review.ts';

/** The identifier kind `C-001` assigns to a pagination cursor. */
const CURSOR_PREFIX = 'cur_';
const CURSOR_PATTERN = /^cur_[0-9]{4,26}$/;

/** One repository implements the queue port; there is no second writer of this table. */
export type WardDescriptionReviewRepository = WardDescriptionReviewPort;

function encodeCursor(offset: number): string {
  return `${CURSOR_PREFIX}${String(offset).padStart(6, '0')}`;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || !CURSOR_PATTERN.test(cursor)) return 0;
  const offset = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

function toReview(row: typeof wardDescriptionReview.$inferSelect): WardDescriptionReview {
  return {
    id: row.id,
    memberId: row.memberId,
    ...(row.submissionId === null ? {} : { submissionId: row.submissionId }),
    description: row.description,
    ...(row.localGovernmentArea === null ? {} : { localGovernmentArea: row.localGovernmentArea }),
    status: row.status,
    ...(row.resolvedWardId === null ? {} : { resolvedWardId: row.resolvedWardId }),
    ...(row.rejectionReason === null ? {} : { rejectionReason: row.rejectionReason }),
    ...(row.reviewerId === null ? {} : { reviewerId: row.reviewerId }),
    createdAt: row.createdAt,
    ...(row.resolvedAt === null ? {} : { resolvedAt: row.resolvedAt }),
  };
}

/**
 * Builds the review-queue repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the resolution is already inside.
 */
export function createWardDescriptionReviewRepository(
  executor: Executor,
): WardDescriptionReviewRepository {
  const db = executorOf(executor);

  return {
    async create(review) {
      await db.insert(wardDescriptionReview).values({
        id: review.id,
        memberId: review.memberId,
        submissionId: review.submissionId ?? null,
        description: review.description,
        localGovernmentArea: review.localGovernmentArea ?? null,
        status: review.status,
        resolvedWardId: review.resolvedWardId ?? null,
        rejectionReason: review.rejectionReason ?? null,
        reviewerId: review.reviewerId ?? null,
        createdAt: review.createdAt,
        resolvedAt: review.resolvedAt ?? null,
      });
    },

    async findById(reviewId) {
      const rows = await db
        .select()
        .from(wardDescriptionReview)
        .where(eq(wardDescriptionReview.id, reviewId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toReview(row);
    },

    async listQueuedByMember(memberId) {
      const rows = await db
        .select()
        .from(wardDescriptionReview)
        .where(
          and(
            eq(wardDescriptionReview.memberId, memberId),
            eq(wardDescriptionReview.status, 'queued'),
          ),
        )
        .orderBy(asc(wardDescriptionReview.createdAt), asc(wardDescriptionReview.id));
      return rows.map(toReview);
    },

    async listQueue(query) {
      const offset = decodeCursor(query.cursor);
      const filter =
        query.localGovernmentArea === undefined
          ? eq(wardDescriptionReview.status, query.status)
          : and(
              eq(wardDescriptionReview.status, query.status),
              eq(wardDescriptionReview.localGovernmentArea, query.localGovernmentArea),
            );

      // Oldest first: the resident who has waited longest is reviewed first (`C-055`).
      const rows = await db
        .select()
        .from(wardDescriptionReview)
        .where(filter)
        .orderBy(asc(wardDescriptionReview.createdAt), asc(wardDescriptionReview.id))
        .limit(query.limit + 1)
        .offset(offset);

      const page = rows.slice(0, query.limit);
      const memberIds = [...new Set(page.map((row) => row.memberId))];

      const members =
        memberIds.length === 0
          ? []
          : await db
              .select({
                id: member.id,
                identityState: member.identityState,
                wardStatus: member.wardStatus,
                deletedAt: member.deletedAt,
              })
              .from(member)
              .where(inArray(member.id, memberIds));

      // The references a reviewer needs in order to see what the resolution will move.
      const references =
        memberIds.length === 0
          ? []
          : await db
              .select({ authorId: submission.authorId, reference: submission.reference })
              .from(submission)
              .where(
                and(
                  inArray(submission.authorId, memberIds),
                  eq(submission.wardStatus, 'unresolved'),
                ),
              )
              .orderBy(asc(submission.submittedAt), asc(submission.reference));

      const reviews: QueuedWardDescriptionReview[] = page.map((row) => {
        const memberRow = members.find((candidate) => candidate.id === row.memberId);
        return {
          review: toReview(row),
          member:
            memberRow === undefined
              ? null
              : {
                  id: memberRow.id,
                  identityState: memberRow.identityState,
                  wardStatus: memberRow.wardStatus,
                  deleted: memberRow.deletedAt !== null,
                },
          submissionReferences: references
            .filter((reference) => reference.authorId === row.memberId)
            .map((reference) => reference.reference),
        };
      });

      return {
        reviews,
        nextCursor:
          rows.length > query.limit ? encodeCursor(offset + page.length) : null,
      };
    },

    async countQueued() {
      const rows = await db
        .select({ value: count() })
        .from(wardDescriptionReview)
        .where(eq(wardDescriptionReview.status, 'queued'));
      return Number(rows[0]?.value ?? 0);
    },

    async markResolved(input) {
      const updated = await db
        .update(wardDescriptionReview)
        .set({
          status: 'resolved',
          resolvedWardId: input.wardId,
          reviewerId: input.reviewerId,
          resolvedAt: input.resolvedAt,
        })
        .where(
          and(
            eq(wardDescriptionReview.id, input.reviewId),
            eq(wardDescriptionReview.status, 'queued'),
          ),
        )
        .returning({ id: wardDescriptionReview.id });
      return updated.length > 0;
    },

    async markRejected(input) {
      const updated = await db
        .update(wardDescriptionReview)
        .set({
          status: 'rejected',
          rejectionReason: input.rejectionReason,
          reviewerId: input.reviewerId,
          resolvedAt: input.resolvedAt,
        })
        .where(
          and(
            eq(wardDescriptionReview.id, input.reviewId),
            eq(wardDescriptionReview.status, 'queued'),
          ),
        )
        .returning({ id: wardDescriptionReview.id });
      return updated.length > 0;
    },
  };
}
