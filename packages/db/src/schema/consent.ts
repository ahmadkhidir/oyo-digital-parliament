/**
 * Consent (`schema.md` Consent).
 *
 * One optional purpose per record. `schema.md` gives the entity a single `granted` flag and a
 * `withdrawnAt`, with no history entity, so a member holds at most one current row per purpose; the
 * history of the change is the audit log (`C-090`), not a second product table.
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { consentPurpose } from './enums.ts';
import { member } from './member.ts';

export const consent = pgTable(
  'consent',
  {
    id: text('id').primaryKey(),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    purpose: consentPurpose('purpose').notNull(),
    granted: boolean('granted').notNull(),
    recordedAt: utcTimestamp('recorded_at').notNull(),
    withdrawnAt: utcTimestamp('withdrawn_at'),
  },
  (t) => [
    check('consent_id_format', isIdentifier(t.id)),
    check('consent_withdrawal_state', sql`${t.granted} = false or ${t.withdrawnAt} is null`),
    // Read path: `C-034` updates the one record for a purpose, and the decision-notice path reads it.
    uniqueIndex('consent_member_purpose_key').on(t.memberId, t.purpose),
  ],
);

export const consentRelations = relations(consent, ({ one }) => ({
  member: one(member, { fields: [consent.memberId], references: [member.id] }),
}));
