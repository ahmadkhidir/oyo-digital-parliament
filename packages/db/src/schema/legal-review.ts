/**
 * LegalReview (`schema.md` LegalReview).
 *
 * A submission or comment held for legal exposure, the reviewer's decision, and the public note that
 * keeps the ledger honest. `requested_by_id` references either a Member or a StaffUser, so it is
 * stored as an identifier without a foreign key: `schema.md` gives the field no single target, and a
 * foreign key would force one of the two to be wrong. The pair `submission_id` / `comment_id` is
 * constrained to exactly one target, because a case is about one item.
 *
 * `outcome_reason` is the legal reviewer's private reasoning and is retained for the legal hold
 * period; `public_note` is the published sentence and is required whenever the outcome withholds or
 * takes down an item (`FEAT-014`, `NFR-043`).
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { legalReviewStatus } from './enums.ts';
import { submission } from './submission.ts';
import { comment } from './comment.ts';
import { staffUser } from './staff-user.ts';

export const legalReview = pgTable(
  'legal_review',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id').references(() => submission.id),
    commentId: text('comment_id').references(() => comment.id),
    /** References a Member or a StaffUser; no single table, so no foreign key (see module comment). */
    requestedById: text('requested_by_id').notNull(),
    reason: varchar('reason', { length: 1000 }).notNull(),
    status: legalReviewStatus('status').notNull(),
    reviewerId: text('reviewer_id').references(() => staffUser.id),
    /** Private legal reasoning, retained for the legal hold period. */
    outcomeReason: varchar('outcome_reason', { length: 2000 }),
    /** The published sentence when an item is withheld or taken down. */
    publicNote: varchar('public_note', { length: 500 }),
    requestedAt: utcTimestamp('requested_at').notNull(),
    decidedAt: utcTimestamp('decided_at'),
  },
  (t) => [
    check('legal_review_id_format', isIdentifier(t.id)),
    check('legal_review_requester_format', isIdentifier(t.requestedById)),
    check('legal_review_single_target', sql`num_nonnulls(${t.submissionId}, ${t.commentId}) = 1`),
    check(
      'legal_review_public_note_required',
      sql`${t.status} not in ('withheld', 'takedown') or ${t.publicNote} is not null`,
    ),
    // Read path: the open legal queue (`C-053`).
    index('legal_review_queue_idx').on(t.status, t.requestedAt),
    index('legal_review_submission_idx').on(t.submissionId),
    index('legal_review_comment_idx').on(t.commentId),
  ],
);

export const legalReviewRelations = relations(legalReview, ({ one }) => ({
  submission: one(submission, {
    fields: [legalReview.submissionId],
    references: [submission.id],
  }),
  comment: one(comment, { fields: [legalReview.commentId], references: [comment.id] }),
  reviewer: one(staffUser, {
    fields: [legalReview.reviewerId],
    references: [staffUser.id],
  }),
}));
