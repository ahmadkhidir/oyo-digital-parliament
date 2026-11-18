/**
 * Reservation (`schema.md` Reservation).
 *
 * One member's place, or waitlist position, at one session. `C-029` makes a repeat call return the
 * existing reservation rather than create a duplicate, so the database holds one row per member and
 * session; a cancelled row remains readable and is updated rather than duplicated.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { reservationStatus } from './enums.ts';
import { session } from './session.ts';
import { member } from './member.ts';

export const reservation = pgTable(
  'reservation',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    status: reservationStatus('status').notNull(),
    /** Position on the waitlist, when waitlisted. */
    waitlistPosition: integer('waitlist_position'),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('reservation_id_format', isIdentifier(t.id)),
    check(
      'reservation_waitlist_position',
      sql`${t.status} <> 'waitlisted' or (${t.waitlistPosition} is not null and ${t.waitlistPosition} >= 1)`,
    ),
    // `C-029`: a retry never creates a duplicate for the same member and session.
    uniqueIndex('reservation_member_session_key').on(t.sessionId, t.memberId),
    // Read path: places remaining and the waitlist ordering for a session (`C-029`).
    index('reservation_session_status_idx').on(t.sessionId, t.status, t.waitlistPosition),
  ],
);

export const reservationRelations = relations(reservation, ({ one }) => ({
  session: one(session, { fields: [reservation.sessionId], references: [session.id] }),
  member: one(member, { fields: [reservation.memberId], references: [member.id] }),
}));
