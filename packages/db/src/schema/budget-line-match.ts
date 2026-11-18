/**
 * BudgetLineMatch (`schema.md` BudgetLineMatch).
 *
 * A candidate appropriation line for a commitment, confirmed or rejected by a named staff member
 * before publication. `confidence` is model output and is never authoritative: it is a number on a
 * suggestion, and only `confirmed` with a `confirmed_by_id` may be published (`NFR-053`, `FEAT-009`).
 * `amount` is money and is stored as integer naira (`C-001`).
 */
import { relations, sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { budgetLineMatchStatus } from './enums.ts';
import { commitment } from './commitment.ts';
import { staffUser } from './staff-user.ts';

export const budgetLineMatch = pgTable(
  'budget_line_match',
  {
    id: text('id').primaryKey(),
    commitmentId: text('commitment_id')
      .notNull()
      .references(() => commitment.id),
    lineReference: varchar('line_reference', { length: 120 }).notNull(),
    lineDescription: varchar('line_description', { length: 500 }).notNull(),
    /** Money: integer naira, no decimals (`C-001`). */
    amount: integer('amount').notNull(),
    /** The model's confidence in the candidate, 0 to 1. Never a confirmation. */
    confidence: doublePrecision('confidence'),
    status: budgetLineMatchStatus('status').notNull(),
    confirmedById: text('confirmed_by_id').references(() => staffUser.id),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('budget_line_match_id_format', isIdentifier(t.id)),
    check('budget_line_match_amount', sql`${t.amount} >= 0`),
    check(
      'budget_line_match_confidence_range',
      sql`${t.confidence} is null or (${t.confidence} >= 0 and ${t.confidence} <= 1)`,
    ),
    check(
      'budget_line_match_confirmation',
      sql`${t.status} = 'suggested' or ${t.confirmedById} is not null`,
    ),
    // Read path: the candidates for one commitment in the report-card workbench (`C-047`, `C-048`).
    index('budget_line_match_commitment_idx').on(t.commitmentId, t.status),
    // Read path: the quarter's outstanding candidate list (`C-047`).
    index('budget_line_match_status_idx').on(t.status, t.createdAt),
  ],
);

export const budgetLineMatchRelations = relations(budgetLineMatch, ({ one }) => ({
  commitment: one(commitment, {
    fields: [budgetLineMatch.commitmentId],
    references: [commitment.id],
  }),
  confirmedBy: one(staffUser, {
    fields: [budgetLineMatch.confirmedById],
    references: [staffUser.id],
  }),
}));
