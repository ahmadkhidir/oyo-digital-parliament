/**
 * DeliveryEvidence (`schema.md` DeliveryEvidence).
 *
 * Evidence that a commitment was delivered, recorded against it and published only when it is safe to
 * publish (`public`). Nothing deletes it: a correction is a new record that does not rewrite history.
 */
import { relations } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { deliveryEvidenceType } from './enums.ts';
import { commitment } from './commitment.ts';
import { staffUser } from './staff-user.ts';

export const deliveryEvidence = pgTable(
  'delivery_evidence',
  {
    id: text('id').primaryKey(),
    commitmentId: text('commitment_id')
      .notNull()
      .references(() => commitment.id),
    type: deliveryEvidenceType('type').notNull(),
    /** The line reference, visit date or document identifier. */
    reference: varchar('reference', { length: 200 }).notNull(),
    description: varchar('description', { length: 1000 }).notNull(),
    recordedById: text('recorded_by_id')
      .notNull()
      .references(() => staffUser.id),
    recordedAt: utcTimestamp('recorded_at').notNull(),
    /** Whether the evidence may be shown on the public record. */
    public: boolean('public').notNull(),
  },
  (t) => [
    check('delivery_evidence_id_format', isIdentifier(t.id)),
    // Read path: the evidence attached to a commitment (`C-024`, `C-046`).
    index('delivery_evidence_commitment_idx').on(t.commitmentId, t.recordedAt),
  ],
);

export const deliveryEvidenceRelations = relations(deliveryEvidence, ({ one }) => ({
  commitment: one(commitment, {
    fields: [deliveryEvidence.commitmentId],
    references: [commitment.id],
  }),
  recordedBy: one(staffUser, {
    fields: [deliveryEvidence.recordedById],
    references: [staffUser.id],
  }),
}));
