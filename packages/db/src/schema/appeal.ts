/**
 * Appeal (`schema.md` Appeal).
 *
 * A member's challenge to a removal, decided by a reviewer outside the campaign. `reason` is the
 * member's own words (personal free text) and is visible only to the assigned reviewer and the
 * operator path, never in a public projection or a search document.
 */
import { relations } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { appealStatus } from './enums.ts';
import { comment } from './comment.ts';
import { member } from './member.ts';
import { staffUser } from './staff-user.ts';

export const appeal = pgTable(
  'appeal',
  {
    id: text('id').primaryKey(),
    commentId: text('comment_id')
      .notNull()
      .references(() => comment.id),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    /** Personal free text: why the member says the removal was wrong. */
    reason: varchar('reason', { length: 1500 }).notNull(),
    status: appealStatus('status').notNull(),
    assignedReviewerId: text('assigned_reviewer_id').references(() => staffUser.id),
    reviewerId: text('reviewer_id').references(() => staffUser.id),
    outcomeReason: varchar('outcome_reason', { length: 1000 }),
    createdAt: utcTimestamp('created_at').notNull(),
    decidedAt: utcTimestamp('decided_at'),
  },
  (t) => [
    check('appeal_id_format', isIdentifier(t.id)),
    // Read path: the open appeal queue (`C-051`).
    index('appeal_queue_idx').on(t.status, t.createdAt),
    index('appeal_comment_idx').on(t.commentId),
  ],
);

export const appealRelations = relations(appeal, ({ one }) => ({
  comment: one(comment, { fields: [appeal.commentId], references: [comment.id] }),
  member: one(member, { fields: [appeal.memberId], references: [member.id] }),
  assignedReviewer: one(staffUser, {
    relationName: 'appeal_assigned_reviewer',
    fields: [appeal.assignedReviewerId],
    references: [staffUser.id],
  }),
  reviewer: one(staffUser, {
    relationName: 'appeal_reviewer',
    fields: [appeal.reviewerId],
    references: [staffUser.id],
  }),
}));
