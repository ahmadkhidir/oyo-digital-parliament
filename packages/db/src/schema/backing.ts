/**
 * Backing (`schema.md` Backing).
 *
 * One member's support for one submission, recorded instead of a duplicate submission. The
 * `identity_state_at_backing` and `ward_id_at_backing` snapshots exist so a count can be split later
 * without re-deriving history when a member moves or is checked.
 *
 * The partial unique index is the database half of `C-017`'s `CONFLICT_DUPLICATE_BACKING`: a member
 * holds at most one active backing per submission, while a withdrawn or voided row remains readable
 * and does not block a later re-backing.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { backingState, identityState } from './enums.ts';
import { member } from './member.ts';
import { submission } from './submission.ts';
import { ward } from './ward.ts';

export const backing = pgTable(
  'backing',
  {
    id: text('id').primaryKey(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submission.id),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    identityStateAtBacking: identityState('identity_state_at_backing').notNull(),
    wardIdAtBacking: text('ward_id_at_backing')
      .notNull()
      .references(() => ward.id),
    state: backingState('state').notNull(),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('backing_id_format', isIdentifier(t.id)),
    // Read path: `C-017` refuses a second active backing from the same member (`FEAT-005`).
    uniqueIndex('backing_active_member_key')
      .on(t.submissionId, t.memberId)
      .where(sql`${t.state} = 'active'`),
    // Read path: the backing count and the checked-backing count on a submission (`C-023`).
    index('backing_submission_idx').on(t.submissionId, t.state),
    // Read path: the ward spread of a submission's backings (`C-017`, `C-023`).
    index('backing_ward_idx').on(t.wardIdAtBacking, t.state),
    // Read path: a member's own record (`C-032`).
    index('backing_member_idx').on(t.memberId),
  ],
);

export const backingRelations = relations(backing, ({ one }) => ({
  submission: one(submission, { fields: [backing.submissionId], references: [submission.id] }),
  member: one(member, { fields: [backing.memberId], references: [member.id] }),
  wardAtBacking: one(ward, { fields: [backing.wardIdAtBacking], references: [ward.id] }),
}));
