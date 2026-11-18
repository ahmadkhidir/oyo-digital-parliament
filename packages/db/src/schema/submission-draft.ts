/**
 * SubmissionDraft (`schema.md` SubmissionDraft).
 *
 * A private partial submission, including one held for the assisted-intake daily allowance review.
 * Nothing here is public until publication; the body is held for 30 days and the expiry sweep reads
 * `expires_at` (`nfr.md` Data lifecycle).
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import {
  costBand,
  locationScope,
  pillar,
  submissionDraftStatus,
  submissionType,
  wardStatus,
} from './enums.ts';
import { member } from './member.ts';
import { staffUser } from './staff-user.ts';
import { ward } from './ward.ts';

export const submissionDraft = pgTable(
  'submission_draft',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => member.id),
    recorderId: text('recorder_id').references(() => staffUser.id),
    wardId: text('ward_id').references(() => ward.id),
    wardStatus: wardStatus('ward_status').notNull(),
    type: submissionType('type'),
    /** The draft text in the author's own words. Private until publication. */
    body: varchar('body', { length: 2000 }),
    pillar: pillar('pillar'),
    locationText: varchar('location_text', { length: 300 }),
    locationScope: locationScope('location_scope'),
    costBand: costBand('cost_band'),
    responsibleAuthority: varchar('responsible_authority', { length: 200 }),
    containsNamedEntity: boolean('contains_named_entity'),
    status: submissionDraftStatus('status').notNull(),
    heldReason: varchar('held_reason', { length: 500 }),
    createdAt: utcTimestamp('created_at').notNull(),
    updatedAt: utcTimestamp('updated_at').notNull(),
    expiresAt: utcTimestamp('expires_at').notNull(),
  },
  (t) => [
    check('submission_draft_id_format', isIdentifier(t.id)),
    check(
      'submission_draft_ward_resolution',
      sql`${t.wardStatus} <> 'resolved' or ${t.wardId} is not null`,
    ),
    // Read path: the 30-day draft expiry sweep (nfr.md Data lifecycle).
    index('submission_draft_expires_idx').on(t.expiresAt),
    // Read path: reopening the member's live draft on `/submit` (`C-012`).
    index('submission_draft_author_idx').on(t.authorId, t.updatedAt),
    // Read path: the assisted-intake held-review queue (`C-058`).
    index('submission_draft_status_idx').on(t.status, t.createdAt),
  ],
);

export const submissionDraftRelations = relations(submissionDraft, ({ one }) => ({
  author: one(member, { fields: [submissionDraft.authorId], references: [member.id] }),
  recorder: one(staffUser, { fields: [submissionDraft.recorderId], references: [staffUser.id] }),
  ward: one(ward, { fields: [submissionDraft.wardId], references: [ward.id] }),
}));
