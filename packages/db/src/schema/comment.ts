/**
 * Comment (`schema.md` Comment).
 *
 * A member's contribution under a submission. `body` is the author's published words while the
 * comment is visible; removal is a state change and the text remains available to the reviewer and
 * the moderation log (`FEAT-006`, `FEAT-011`). `routing_flag` is an advisory queue label: it is not
 * published and never changes `status` on its own.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { commentStatus, routingFlag } from './enums.ts';
import { member } from './member.ts';
import { submission } from './submission.ts';
import { moderationAction } from './moderation-action.ts';
import { appeal } from './appeal.ts';
import { legalReview } from './legal-review.ts';

export const comment = pgTable(
  'comment',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submission.id),
    authorId: text('author_id')
      .notNull()
      .references(() => member.id),
    body: varchar('body', { length: 2000 }).notNull(),
    status: commentStatus('status').notNull(),
    /** Advisory queue ordering. Never published and never a status change by itself. */
    routingFlag: routingFlag('routing_flag'),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('comment_id_format', isIdentifier(t.id)),
    check('comment_body_length', sql`char_length(${t.body}) >= 1`),
    // Read path: the published thread under a submission (`C-023`).
    index('comment_submission_idx').on(t.submissionId, t.createdAt),
    // Read path: moderator queue ordering by the advisory label (`C-049`).
    index('comment_routing_idx').on(t.routingFlag, t.createdAt),
  ],
);

export const commentRelations = relations(comment, ({ one, many }) => ({
  submission: one(submission, { fields: [comment.submissionId], references: [submission.id] }),
  author: one(member, { fields: [comment.authorId], references: [member.id] }),
  moderationActions: many(moderationAction),
  appeals: many(appeal),
  legalReviews: many(legalReview),
}));
