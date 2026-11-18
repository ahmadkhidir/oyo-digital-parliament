/**
 * Session (`schema.md` Session).
 *
 * A dated, moderated session at which the campaign answers questions in person. A cancelled session
 * must say why, and a rescheduled session names the one it replaces; one successor per session keeps
 * the reschedule chain linear, the same shape the decision chain uses.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { sessionStatus } from './enums.ts';
import { reservation } from './reservation.ts';
import { sessionQuestion } from './session-question.ts';

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    title: varchar('title', { length: 160 }).notNull(),
    localGovernmentArea: varchar('local_government_area', { length: 120 }).notNull(),
    venue: varchar('venue', { length: 200 }).notNull(),
    startsAt: utcTimestamp('starts_at').notNull(),
    capacity: integer('capacity').notNull(),
    status: sessionStatus('status').notNull(),
    cancellationReason: varchar('cancellation_reason', { length: 500 }),
    rescheduledFromId: text('rescheduled_from_id').references((): AnyPgColumn => session.id),
    recordPublishedAt: utcTimestamp('record_published_at'),
  },
  (t) => [
    check('session_id_format', isIdentifier(t.id)),
    check('session_capacity_min', sql`${t.capacity} >= 1`),
    check(
      'session_cancellation_reason',
      sql`${t.status} <> 'cancelled' or ${t.cancellationReason} is not null`,
    ),
    check(
      'session_reschedule_source',
      sql`${t.status} <> 'rescheduled' or ${t.rescheduledFromId} is not null`,
    ),
    // `Session ||--o| Session`: a session is replaced by at most one successor.
    uniqueIndex('session_rescheduled_from_key')
      .on(t.rescheduledFromId)
      .where(sql`${t.rescheduledFromId} is not null`),
    // Read path: the chronological session list (`screens/12-session-detail.md`).
    index('session_starts_idx').on(t.startsAt),
  ],
);

export const sessionRelations = relations(session, ({ one, many }) => ({
  rescheduledFrom: one(session, {
    relationName: 'session_reschedule_chain',
    fields: [session.rescheduledFromId],
    references: [session.id],
  }),
  rescheduledTo: many(session, { relationName: 'session_reschedule_chain' }),
  reservations: many(reservation),
  questions: many(sessionQuestion),
}));
