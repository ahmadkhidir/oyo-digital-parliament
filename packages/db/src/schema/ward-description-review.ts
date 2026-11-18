/**
 * WardDescriptionReview (`schema.md` WardDescriptionReview).
 *
 * A resident's own description of their area, held only when no candidate ward resolved it. The
 * `description` is personal free text: it is written in one person's words about where they live and
 * can identify them, so it is classified personal data and never enters the search projection, an
 * analytics event, a cache payload or a log line. `local_government_area` is the selected area, not a
 * resolved ward; `resolved_ward_id` is only set when review matches one.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { wardDescriptionReviewStatus } from './enums.ts';
import { member } from './member.ts';
import { submission } from './submission.ts';
import { staffUser } from './staff-user.ts';
import { ward } from './ward.ts';

export const wardDescriptionReview = pgTable(
  'ward_description_review',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    submissionId: text('submission_id').references(() => submission.id),
    /** Personal free text: the resident's description in their own words. */
    description: varchar('description', { length: 500 }).notNull(),
    localGovernmentArea: varchar('local_government_area', { length: 120 }),
    status: wardDescriptionReviewStatus('status').notNull(),
    resolvedWardId: text('resolved_ward_id').references(() => ward.id),
    rejectionReason: varchar('rejection_reason', { length: 500 }),
    reviewerId: text('reviewer_id').references(() => staffUser.id),
    createdAt: utcTimestamp('created_at').notNull(),
    resolvedAt: utcTimestamp('resolved_at'),
  },
  (t) => [
    check('ward_description_review_id_format', isIdentifier(t.id)),
    check(
      'ward_description_review_resolution',
      sql`${t.status} <> 'resolved' or ${t.resolvedWardId} is not null`,
    ),
    check(
      'ward_description_review_rejection',
      sql`${t.status} <> 'rejected' or ${t.rejectionReason} is not null`,
    ),
    // Read path: the unresolved queue read (`C-055`), oldest first.
    index('ward_description_review_queue_idx').on(t.status, t.createdAt),
    index('ward_description_review_member_idx').on(t.memberId),
  ],
);

export const wardDescriptionReviewRelations = relations(wardDescriptionReview, ({ one }) => ({
  member: one(member, {
    fields: [wardDescriptionReview.memberId],
    references: [member.id],
  }),
  submission: one(submission, {
    fields: [wardDescriptionReview.submissionId],
    references: [submission.id],
  }),
  resolvedWard: one(ward, {
    fields: [wardDescriptionReview.resolvedWardId],
    references: [ward.id],
  }),
  reviewer: one(staffUser, {
    fields: [wardDescriptionReview.reviewerId],
    references: [staffUser.id],
  }),
}));
