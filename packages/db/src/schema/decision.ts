/**
 * Decision (`schema.md` Decision).
 *
 * The campaign's published answer to a submission. `schema.md` gives the entity a `supersedesDecisionId`
 * but no live marker, so the one-live-decision rule is enforced with the two partial unique indexes
 * ADR-002 fixes:
 *
 * - at most one **root** per submission (a row with no superseded decision);
 * - at most one **successor** per decision (a decision can be superseded once, by one revision).
 *
 * The live decision is the row no other row names as its `supersedes_decision_id`. A stale supersession
 * — naming a decision that is no longer the tip — fails on the successor index and is mapped to the
 * contract's `CONFLICT_ALREADY_DECIDED` by the repository that writes it. There is no `is_live` column,
 * no pointer table and no trigger, exactly as ADR-002 decides.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { decisionType } from './enums.ts';
import { submission } from './submission.ts';
import { staffUser } from './staff-user.ts';
import { commitment } from './commitment.ts';

export const decision = pgTable(
  'decision',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submission.id),
    /** Increments as decisions are revised; a revision is a new row, never an edit. */
    version: integer('version').notNull(),
    type: decisionType('type').notNull(),
    /** The reason in full. Required for a decline and never truncated in publication. */
    reason: varchar('reason', { length: 2000 }).notNull(),
    /** The body that holds the power. Required for a refer decision. */
    authority: varchar('authority', { length: 200 }),
    signatoryId: text('signatory_id')
      .notNull()
      .references(() => staffUser.id),
    /** The earlier decision this one replaces; the earlier row remains readable. */
    supersedesDecisionId: text('supersedes_decision_id').references((): AnyPgColumn => decision.id),
    publishedAt: utcTimestamp('published_at').notNull(),
  },
  (t) => [
    check('decision_id_format', isIdentifier(t.id)),
    check('decision_version_min', sql`${t.version} >= 1`),
    check('decision_refer_authority', sql`${t.type} <> 'refer' or ${t.authority} is not null`),
    // ADR-002: one root per submission, so a submission never has two competing answers.
    uniqueIndex('decision_root_key')
      .on(t.submissionId)
      .where(sql`${t.supersedesDecisionId} is null`),
    // ADR-002: one successor per decision, so the chain is linear and never branches.
    uniqueIndex('decision_successor_key')
      .on(t.supersedesDecisionId)
      .where(sql`${t.supersedesDecisionId} is not null`),
    // Read path: the live decision and the revision history for one submission (`C-023`, `C-043`).
    index('decision_submission_idx').on(t.submissionId, t.version),
    // Read path: the quarter's published decisions for a report card (`C-084`).
    index('decision_published_idx').on(t.publishedAt),
  ],
);

export const decisionRelations = relations(decision, ({ one, many }) => ({
  submission: one(submission, { fields: [decision.submissionId], references: [submission.id] }),
  signatory: one(staffUser, { fields: [decision.signatoryId], references: [staffUser.id] }),
  supersedes: one(decision, {
    relationName: 'decision_chain',
    fields: [decision.supersedesDecisionId],
    references: [decision.id],
  }),
  supersededBy: many(decision, { relationName: 'decision_chain' }),
  commitment: many(commitment),
}));
