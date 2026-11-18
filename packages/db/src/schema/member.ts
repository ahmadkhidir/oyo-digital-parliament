/**
 * Member (`schema.md` Member).
 *
 * Field classification (`C-001`, `NFR-040`):
 *
 * - `telephone_number` — direct identifier, personal data. Looked up for sign-in only; never indexed
 *   together with a ward and never selected by a public projection.
 * - `full_name` — direct identifier, personal data. Held for attribution and never published.
 * - `declared_age` — personal data, used only to check the 18-to-35 band.
 * - `member.id` — the account reference other aggregates carry; a pseudonymous key, not a public name.
 *
 * There is deliberately **no index on `ward_id`**: the platform never produces a member register by
 * ward, and an index whose only use would be that query is not added (`AGENTS.md` Boundaries,
 * `FEAT-012`). Accounts sharing a number are never merged, so `telephone_number` is not unique.
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, smallint, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { identityState, locale, verificationMethod, wardStatus } from './enums.ts';
import { staffUser } from './staff-user.ts';
import { ward } from './ward.ts';
import { residenceReview } from './residence-review.ts';
import { consent } from './consent.ts';
import { submission } from './submission.ts';
import { submissionDraft } from './submission-draft.ts';
import { backing } from './backing.ts';
import { comment } from './comment.ts';
import { dataRequest } from './data-request.ts';
import { reservation } from './reservation.ts';
import { sessionQuestion } from './session-question.ts';
import { wardDescriptionReview } from './ward-description-review.ts';
import { appeal } from './appeal.ts';

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    /** Personal data — direct identifier. E.164 (`+234` plus ten digits). */
    telephoneNumber: varchar('telephone_number', { length: 20 }).notNull(),
    /** Personal data — direct identifier. Held for attribution, never published. */
    fullName: varchar('full_name', { length: 160 }).notNull(),
    /** The public name shown on submissions and comments. */
    displayName: varchar('display_name', { length: 60 }).notNull(),
    /** Personal data. Only the 18-to-35 band is checked; the exact value is not published. */
    declaredAge: smallint('declared_age').notNull(),
    wardId: text('ward_id').references(() => ward.id),
    wardStatus: wardStatus('ward_status').notNull(),
    identityState: identityState('identity_state').notNull(),
    verificationMethod: verificationMethod('verification_method').notNull(),
    sharedNumber: boolean('shared_number').notNull(),
    attestedById: text('attested_by_id').references(() => staffUser.id),
    attestedAt: utcTimestamp('attested_at'),
    locale: locale('locale').notNull(),
    createdAt: utcTimestamp('created_at').notNull(),
    /** When direct identifiers were removed; the row stays as a non-identifying author reference. */
    deletedAt: utcTimestamp('deleted_at'),
  },
  (t) => [
    check('member_id_format', isIdentifier(t.id)),
    check('member_telephone_format', sql`${t.telephoneNumber} ~ '^\\+234[0-9]{10}$'`),
    check('member_age_band', sql`${t.declaredAge} between 18 and 35`),
    check('member_ward_resolution', sql`${t.wardStatus} <> 'resolved' or ${t.wardId} is not null`),
    check(
      'member_attestation_complete',
      sql`${t.verificationMethod} <> 'organiser_attestation' or (${t.attestedById} is not null and ${t.attestedAt} is not null)`,
    ),
    // Read path: sign-in lookup by the number the code was sent to (`C-005`), and the assisted-intake
    // duplicate check. Never joined to a ward.
    index('member_telephone_idx').on(t.telephoneNumber),
  ],
);

export const memberRelations = relations(member, ({ one, many }) => ({
  ward: one(ward, { fields: [member.wardId], references: [ward.id] }),
  attestedBy: one(staffUser, { fields: [member.attestedById], references: [staffUser.id] }),
  residenceReviews: many(residenceReview),
  consents: many(consent),
  submissions: many(submission),
  submissionDrafts: many(submissionDraft),
  backings: many(backing),
  comments: many(comment),
  dataRequests: many(dataRequest),
  reservations: many(reservation),
  sessionQuestions: many(sessionQuestion),
  wardDescriptionReviews: many(wardDescriptionReview),
  appeals: many(appeal),
}));
