/**
 * Submission (`schema.md` Submission).
 *
 * `body` and `location_text` are the author's published words: public by the act of publishing, and
 * deliberately not treated as a secret. The author reference (`author_id`) is the pseudonymous member
 * identifier, never a name or number. `overdue` is not a column: it is derived from `submitted_at`,
 * `status` and the clock at read time (`FEAT-007`, `packages/domain/AGENTS.md`).
 *
 * A proposal must carry a cost band and a responsible authority (`FEAT-003`), and a resolved ward must
 * have a ward reference; both are enforced here because they are record integrity, not presentation.
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import {
  costBand,
  locationScope,
  pillar,
  submissionSource,
  submissionStatus,
  submissionType,
  wardStatus,
} from './enums.ts';
import { member } from './member.ts';
import { staffUser } from './staff-user.ts';
import { ward } from './ward.ts';
import { backing } from './backing.ts';
import { comment } from './comment.ts';
import { decision } from './decision.ts';
import { commitment } from './commitment.ts';
import { legalReview } from './legal-review.ts';
import { wardDescriptionReview } from './ward-description-review.ts';

export const submission = pgTable(
  'submission',
  {
    id: text('id').primaryKey(),
    /** The short public reference quoted by the resident and printed on an intake slip. */
    reference: varchar('reference', { length: 10 }).notNull(),
    authorId: text('author_id')
      .notNull()
      .references(() => member.id),
    recorderId: text('recorder_id').references(() => staffUser.id),
    wardId: text('ward_id').references(() => ward.id),
    wardStatus: wardStatus('ward_status').notNull(),
    type: submissionType('type').notNull(),
    /** The submission in the author's own words. Published content. */
    body: varchar('body', { length: 2000 }).notNull(),
    pillar: pillar('pillar').notNull(),
    locationText: varchar('location_text', { length: 300 }).notNull(),
    locationScope: locationScope('location_scope').notNull(),
    /** Required for a proposal; a band, never a figure the resident must invent. */
    costBand: costBand('cost_band'),
    /** Required for a proposal: the body that would have to act. */
    responsibleAuthority: varchar('responsible_authority', { length: 200 }),
    status: submissionStatus('status').notNull(),
    /** Holds the submission for legal review before publication when an allegation is named. */
    containsNamedEntity: boolean('contains_named_entity').notNull(),
    source: submissionSource('source').notNull(),
    /** Publication time, which starts the twenty-one-day clock. */
    submittedAt: utcTimestamp('submitted_at').notNull(),
    withdrawnAt: utcTimestamp('withdrawn_at'),
  },
  (t) => [
    check('submission_id_format', isIdentifier(t.id)),
    check('submission_reference_format', sql`${t.reference} ~ '^ODP-[0-9]{6}$'`),
    check('submission_body_length', sql`char_length(${t.body}) >= 30`),
    check(
      'submission_ward_resolution',
      sql`${t.wardStatus} <> 'resolved' or ${t.wardId} is not null`,
    ),
    check(
      'submission_proposal_fields',
      sql`${t.type} <> 'proposal' or (${t.costBand} is not null and ${t.responsibleAuthority} is not null)`,
    ),
    check(
      'submission_withdrawal_time',
      sql`${t.status} <> 'withdrawn' or ${t.withdrawnAt} is not null`,
    ),
    // Read path: the public reference address, `/s/{reference}` (`C-023`).
    uniqueIndex('submission_reference_key').on(t.reference),
    // Read path: a ward's submissions, newest first (`FEAT-002`, `C-026`).
    index('submission_ward_idx').on(t.wardId, t.submittedAt),
    // Read path: the decision queue and the twenty-one-day overdue sweep (`C-040`, `C-083`), which
    // both exclude out-of-area submissions and take awaiting-decision rows oldest first.
    index('submission_queue_idx')
      .on(t.submittedAt)
      .where(sql`${t.status} = 'awaiting_decision' and ${t.locationScope} = 'in_state'`),
    // Read path: a member's own record (`C-032`).
    index('submission_author_idx').on(t.authorId, t.submittedAt),
    // Read path: pillar filter in search (`C-038`) and the pillar breakdown of a ward report (`C-026`).
    index('submission_pillar_idx').on(t.pillar),
  ],
);

export const submissionRelations = relations(submission, ({ one, many }) => ({
  author: one(member, { fields: [submission.authorId], references: [member.id] }),
  recorder: one(staffUser, { fields: [submission.recorderId], references: [staffUser.id] }),
  ward: one(ward, { fields: [submission.wardId], references: [ward.id] }),
  backings: many(backing),
  comments: many(comment),
  decisions: many(decision),
  commitment: many(commitment),
  legalReviews: many(legalReview),
  wardDescriptionReviews: many(wardDescriptionReview),
}));
