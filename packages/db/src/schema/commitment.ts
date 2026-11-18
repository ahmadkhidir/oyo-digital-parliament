/**
 * Commitment (`schema.md` Commitment).
 *
 * A dated, costed promise created by an accepted decision, and the thing the platform exists to track.
 * Two identifiers are unique because the record is one commitment per answer:
 *
 * - `decision_id` — a decision creates at most one commitment (`Decision ||--o| Commitment`);
 * - `submission_id` — a revision updates the existing commitment rather than creating a second one
 *   (`packages/domain/AGENTS.md` Discipline), and a withdrawn submission leaves its commitment in
 *   place, marked, rather than adding another.
 *
 * `budget_line_amount` is money and is stored as integer naira with no decimals (`C-001`). A budget
 * line without a confirming staff member is an unconfirmed match and must not be published; the pair
 * of confirmation columns is therefore set together or not at all.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { calendarDate, isIdentifier, utcTimestamp } from './columns.ts';
import { commitmentStatus, costBand, pillar } from './enums.ts';
import { decision } from './decision.ts';
import { submission } from './submission.ts';
import { ward } from './ward.ts';
import { staffUser } from './staff-user.ts';
import { commitmentStatusChange } from './commitment-status-change.ts';
import { deliveryEvidence } from './delivery-evidence.ts';
import { budgetLineMatch } from './budget-line-match.ts';

export const commitment = pgTable(
  'commitment',
  {
    id: text('id').primaryKey(),
    decisionId: text('decision_id')
      .notNull()
      .references(() => decision.id),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submission.id),
    wardId: text('ward_id')
      .notNull()
      .references(() => ward.id),
    /** The named person answerable for delivery. */
    owner: varchar('owner', { length: 160 }).notNull(),
    /** The stated cost band. Never empty on a commitment. */
    costBand: costBand('cost_band').notNull(),
    targetDate: calendarDate('target_date').notNull(),
    status: commitmentStatus('status').notNull(),
    /** Required when the status becomes slipped or dropped. */
    statusReason: varchar('status_reason', { length: 1000 }),
    budgetLineReference: varchar('budget_line_reference', { length: 120 }),
    budgetLineDescription: varchar('budget_line_description', { length: 500 }),
    /** Money: integer naira, no decimals (`C-001`). */
    budgetLineAmount: integer('budget_line_amount'),
    /** Absent means the match is unconfirmed and must not be published. */
    budgetLineConfirmedById: text('budget_line_confirmed_by_id').references(() => staffUser.id),
    budgetLineConfirmedAt: utcTimestamp('budget_line_confirmed_at'),
    withdrawnByAuthor: boolean('withdrawn_by_author').notNull(),
    authorWithdrawnAt: utcTimestamp('author_withdrawn_at'),
    pillar: pillar('pillar').notNull(),
    updatedAt: utcTimestamp('updated_at').notNull(),
  },
  (t) => [
    check('commitment_id_format', isIdentifier(t.id)),
    check(
      'commitment_amount_non_negative',
      sql`${t.budgetLineAmount} is null or ${t.budgetLineAmount} >= 0`,
    ),
    check(
      'commitment_status_reason',
      sql`${t.status} not in ('slipped', 'dropped') or ${t.statusReason} is not null`,
    ),
    check(
      'commitment_budget_confirmation_pair',
      sql`(${t.budgetLineConfirmedById} is null) = (${t.budgetLineConfirmedAt} is null)`,
    ),
    check(
      'commitment_author_withdrawal_time',
      sql`${t.withdrawnByAuthor} = false or ${t.authorWithdrawnAt} is not null`,
    ),
    // Read path: one commitment per decision (`Decision ||--o| Commitment`).
    uniqueIndex('commitment_decision_key').on(t.decisionId),
    // Read path: a revision updates the existing commitment for the submission.
    uniqueIndex('commitment_submission_key').on(t.submissionId),
    // Read path: a ward's commitments at quarter end (`C-026`, `C-084`).
    index('commitment_ward_idx').on(t.wardId, t.status),
    // Read path: the commitment register filtered by status and target date (`C-024`).
    index('commitment_target_idx').on(t.targetDate, t.status),
    // Read path: the pillar breakdown of a ward report (`C-026`).
    index('commitment_pillar_idx').on(t.pillar, t.status),
  ],
);

export const commitmentRelations = relations(commitment, ({ one, many }) => ({
  decision: one(decision, { fields: [commitment.decisionId], references: [decision.id] }),
  submission: one(submission, { fields: [commitment.submissionId], references: [submission.id] }),
  ward: one(ward, { fields: [commitment.wardId], references: [ward.id] }),
  budgetLineConfirmedBy: one(staffUser, {
    fields: [commitment.budgetLineConfirmedById],
    references: [staffUser.id],
  }),
  statusChanges: many(commitmentStatusChange),
  deliveryEvidence: many(deliveryEvidence),
  budgetLineMatches: many(budgetLineMatch),
}));
