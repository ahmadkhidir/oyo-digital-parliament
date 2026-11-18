/**
 * WardReportSnapshot (`schema.md` WardReportSnapshot).
 *
 * One ward's published figures for one quarter, fixed at generation so a published number cannot
 * change under a reader. `suppression_applied` records that a figure was withheld for being too small
 * to publish without identifying an author; the suppression rule itself is a domain policy, and the
 * snapshot only records that it ran (`FEAT-009`).
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { reportCard } from './report-card.ts';
import { ward } from './ward.ts';

export const wardReportSnapshot = pgTable(
  'ward_report_snapshot',
  {
    id: text('id').primaryKey(),
    reportCardId: text('report_card_id')
      .notNull()
      .references(() => reportCard.id),
    wardId: text('ward_id')
      .notNull()
      .references(() => ward.id),
    quarter: varchar('quarter', { length: 7 }).notNull(),
    submissions: integer('submissions').notNull(),
    decisions: integer('decisions').notNull(),
    commitments: integer('commitments').notNull(),
    overdue: integer('overdue').notNull(),
    suppressionApplied: boolean('suppression_applied').notNull(),
    generatedAt: utcTimestamp('generated_at').notNull(),
  },
  (t) => [
    check('ward_report_snapshot_id_format', isIdentifier(t.id)),
    check('ward_report_snapshot_quarter_format', sql`${t.quarter} ~ '^[0-9]{4}-Q[1-4]$'`),
    check('ward_report_snapshot_submissions', sql`${t.submissions} >= 0`),
    check('ward_report_snapshot_decisions', sql`${t.decisions} >= 0`),
    check('ward_report_snapshot_commitments', sql`${t.commitments} >= 0`),
    check('ward_report_snapshot_overdue', sql`${t.overdue} >= 0`),
    // One snapshot per ward per card: a correction is a new card, not a second row on the old one.
    uniqueIndex('ward_report_snapshot_card_ward_key').on(t.reportCardId, t.wardId),
  ],
);

export const wardReportSnapshotRelations = relations(wardReportSnapshot, ({ one }) => ({
  reportCard: one(reportCard, {
    fields: [wardReportSnapshot.reportCardId],
    references: [reportCard.id],
  }),
  ward: one(ward, { fields: [wardReportSnapshot.wardId], references: [ward.id] }),
}));
