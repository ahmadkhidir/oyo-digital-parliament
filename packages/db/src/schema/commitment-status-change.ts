/**
 * CommitmentStatusChange (`schema.md` CommitmentStatusChange).
 *
 * One recorded move between commitment statuses, kept so a quarterly report card can show movement
 * rather than only the current total (`FEAT-009`). It is an event-like record: nothing updates or
 * deletes it.
 */
import { relations } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { commitmentStatus } from './enums.ts';
import { commitment } from './commitment.ts';
import { staffUser } from './staff-user.ts';

export const commitmentStatusChange = pgTable(
  'commitment_status_change',
  {
    id: text('id').primaryKey(),
    commitmentId: text('commitment_id')
      .notNull()
      .references(() => commitment.id),
    fromStatus: commitmentStatus('from_status').notNull(),
    toStatus: commitmentStatus('to_status').notNull(),
    reason: varchar('reason', { length: 1000 }).notNull(),
    changedById: text('changed_by_id')
      .notNull()
      .references(() => staffUser.id),
    changedAt: utcTimestamp('changed_at').notNull(),
  },
  (t) => [
    check('commitment_status_change_id_format', isIdentifier(t.id)),
    // Read path: the movement history of one commitment (`C-045`, `C-024`).
    index('commitment_status_change_commitment_idx').on(t.commitmentId, t.changedAt),
    // Read path: the quarter's status changes for a report card (`C-084`).
    index('commitment_status_change_time_idx').on(t.changedAt),
  ],
);

export const commitmentStatusChangeRelations = relations(commitmentStatusChange, ({ one }) => ({
  commitment: one(commitment, {
    fields: [commitmentStatusChange.commitmentId],
    references: [commitment.id],
  }),
  changedBy: one(staffUser, {
    fields: [commitmentStatusChange.changedById],
    references: [staffUser.id],
  }),
}));
