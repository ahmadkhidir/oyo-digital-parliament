/**
 * DecisionDraft (`schema.md` DecisionDraft).
 *
 * A staff member's private draft of a decision, reserved so a colleague cannot publish a competing
 * answer. The reservation is acquired and released by conditional writes on `staff_id` and
 * `reserved_until` (`C-041`, `C-042`), so there is no unique index on `submission_id`: an expired
 * reservation must be claimable by the next staff member, and expiry is a clock comparison rather than
 * a row state the database can index. A live reservation is one whose `reserved_until` is in the
 * future; the repository's conditional update is what makes that exclusive.
 */
import { relations } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { calendarDate, isIdentifier, utcTimestamp } from './columns.ts';
import { costBand, decisionType, pillar } from './enums.ts';
import { submission } from './submission.ts';
import { staffUser } from './staff-user.ts';

export const decisionDraft = pgTable(
  'decision_draft',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submission.id),
    staffId: text('staff_id')
      .notNull()
      .references(() => staffUser.id),
    type: decisionType('type').notNull(),
    /** The draft reason. Private until the decision is published. */
    reason: varchar('reason', { length: 2000 }),
    authority: varchar('authority', { length: 200 }),
    /** The owner named in a draft commitment. */
    owner: varchar('owner', { length: 160 }),
    costBand: costBand('cost_band'),
    targetDate: calendarDate('target_date'),
    pillar: pillar('pillar'),
    /** When the reservation expires and a colleague may take the case. */
    reservedUntil: utcTimestamp('reserved_until').notNull(),
    createdAt: utcTimestamp('created_at').notNull(),
    updatedAt: utcTimestamp('updated_at').notNull(),
  },
  (t) => [
    check('decision_draft_id_format', isIdentifier(t.id)),
    // Read path: the live reservation for a case (`C-041`) and the reservation expiry sweep.
    index('decision_draft_submission_idx').on(t.submissionId, t.reservedUntil),
    index('decision_draft_staff_idx').on(t.staffId),
  ],
);

export const decisionDraftRelations = relations(decisionDraft, ({ one }) => ({
  submission: one(submission, {
    fields: [decisionDraft.submissionId],
    references: [submission.id],
  }),
  staff: one(staffUser, { fields: [decisionDraft.staffId], references: [staffUser.id] }),
}));
