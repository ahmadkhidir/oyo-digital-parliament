/**
 * ReportCard (`schema.md` ReportCard).
 *
 * One quarterly report card at state level, fixed at publication and corrected only by publishing a
 * new version. `status` carries `published`, `superseded` and `corrected`, and `correction_of_id`
 * points at the card this one corrects; the row is never rewritten, because a published figure that
 * changes under a reader is worse than a wrong one (`FEAT-009`, `NFR-002`).
 *
 * Rates are stored as a `double precision` between 0 and 1, matching the schema's `number` with
 * `minimum: 0, maximum: 1`. They are derived figures published with the card, not money.
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
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { reportCardStatus } from './enums.ts';
import { wardReportSnapshot } from './ward-report-snapshot.ts';
import { wardPillarSnapshot } from './ward-pillar-snapshot.ts';

export const reportCard = pgTable(
  'report_card',
  {
    id: text('id').primaryKey(),
    /** The quarter covered, in `YYYY-QN` form. */
    quarter: varchar('quarter', { length: 7 }).notNull(),
    cutOffAt: utcTimestamp('cut_off_at').notNull(),
    publishedAt: utcTimestamp('published_at'),
    status: reportCardStatus('status').notNull(),
    correctionOfId: text('correction_of_id').references((): AnyPgColumn => reportCard.id),
    answerRate: doublePrecision('answer_rate').notNull(),
    deliveryRate: doublePrecision('delivery_rate').notNull(),
    committedCount: integer('committed_count').notNull(),
    deliveredCount: integer('delivered_count').notNull(),
    slippedCount: integer('slipped_count').notNull(),
    droppedCount: integer('dropped_count').notNull(),
    summaryNote: varchar('summary_note', { length: 2000 }),
    generatedAt: utcTimestamp('generated_at').notNull(),
  },
  (t) => [
    check('report_card_id_format', isIdentifier(t.id)),
    check('report_card_quarter_format', sql`${t.quarter} ~ '^[0-9]{4}-Q[1-4]$'`),
    check('report_card_answer_rate_range', sql`${t.answerRate} between 0 and 1`),
    check('report_card_delivery_rate_range', sql`${t.deliveryRate} between 0 and 1`),
    check('report_card_committed_count', sql`${t.committedCount} >= 0`),
    check('report_card_delivered_count', sql`${t.deliveredCount} >= 0`),
    check('report_card_slipped_count', sql`${t.slippedCount} >= 0`),
    check('report_card_dropped_count', sql`${t.droppedCount} >= 0`),
    // Read path: the latest card for a quarter and its correction chain (`C-027`).
    index('report_card_quarter_idx').on(t.quarter, t.status),
    index('report_card_correction_idx').on(t.correctionOfId),
  ],
);

export const reportCardRelations = relations(reportCard, ({ one, many }) => ({
  correctionOf: one(reportCard, {
    relationName: 'report_card_correction_chain',
    fields: [reportCard.correctionOfId],
    references: [reportCard.id],
  }),
  correctedBy: many(reportCard, { relationName: 'report_card_correction_chain' }),
  wardReportSnapshots: many(wardReportSnapshot),
  wardPillarSnapshots: many(wardPillarSnapshot),
}));
