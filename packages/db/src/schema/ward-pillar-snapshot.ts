/**
 * WardPillarSnapshot (`schema.md` WardPillarSnapshot).
 *
 * One ward's published figures for one manifesto pillar in one quarter. A second snapshot for the
 * same ward, card and pillar would be two answers to the same question, so the triple is unique.
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { pillar } from './enums.ts';
import { reportCard } from './report-card.ts';
import { ward } from './ward.ts';

export const wardPillarSnapshot = pgTable(
  'ward_pillar_snapshot',
  {
    id: text('id').primaryKey(),
    reportCardId: text('report_card_id')
      .notNull()
      .references(() => reportCard.id),
    wardId: text('ward_id')
      .notNull()
      .references(() => ward.id),
    quarter: varchar('quarter', { length: 7 }).notNull(),
    pillar: pillar('pillar').notNull(),
    submissions: integer('submissions').notNull(),
    decisions: integer('decisions').notNull(),
    commitments: integer('commitments').notNull(),
    overdue: integer('overdue').notNull(),
    suppressionApplied: boolean('suppression_applied').notNull(),
    generatedAt: utcTimestamp('generated_at').notNull(),
  },
  (t) => [
    check('ward_pillar_snapshot_id_format', isIdentifier(t.id)),
    check('ward_pillar_snapshot_quarter_format', sql`${t.quarter} ~ '^[0-9]{4}-Q[1-4]$'`),
    check('ward_pillar_snapshot_submissions', sql`${t.submissions} >= 0`),
    check('ward_pillar_snapshot_decisions', sql`${t.decisions} >= 0`),
    check('ward_pillar_snapshot_commitments', sql`${t.commitments} >= 0`),
    check('ward_pillar_snapshot_overdue', sql`${t.overdue} >= 0`),
    // Read path: the pillar breakdown of a ward's quarter (`C-026`).
    uniqueIndex('ward_pillar_snapshot_card_ward_pillar_key').on(t.reportCardId, t.wardId, t.pillar),
  ],
);

export const wardPillarSnapshotRelations = relations(wardPillarSnapshot, ({ one }) => ({
  reportCard: one(reportCard, {
    fields: [wardPillarSnapshot.reportCardId],
    references: [reportCard.id],
  }),
  ward: one(ward, { fields: [wardPillarSnapshot.wardId], references: [ward.id] }),
}));
