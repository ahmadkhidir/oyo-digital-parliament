/**
 * ResidenceReview (`schema.md` ResidenceReview).
 *
 * The review that moves a member from Registered to Checked. `notes` is held privately: it is a
 * reviewer's working note and may describe a residence and the people in it, so it is classified
 * personal free text and never enters a public projection, a search document or an analytics event.
 */
import { relations } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { residenceReviewDecision, residenceReviewMethod } from './enums.ts';
import { member } from './member.ts';
import { staffUser } from './staff-user.ts';

export const residenceReview = pgTable(
  'residence_review',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    reviewerId: text('reviewer_id')
      .notNull()
      .references(() => staffUser.id),
    method: residenceReviewMethod('method').notNull(),
    /** Personal free text: the reviewer's private note. */
    notes: varchar('notes', { length: 1000 }),
    decision: residenceReviewDecision('decision').notNull(),
    reviewedAt: utcTimestamp('reviewed_at').notNull(),
  },
  (t) => [
    check('residence_review_id_format', isIdentifier(t.id)),
    // Read path: the member's latest review decides the displayed identity state (`C-032`).
    index('residence_review_member_idx').on(t.memberId, t.reviewedAt),
  ],
);

export const residenceReviewRelations = relations(residenceReview, ({ one }) => ({
  member: one(member, { fields: [residenceReview.memberId], references: [member.id] }),
  reviewer: one(staffUser, {
    fields: [residenceReview.reviewerId],
    references: [staffUser.id],
  }),
}));
