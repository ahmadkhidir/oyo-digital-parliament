/**
 * StaffUser (`schema.md` StaffUser).
 *
 * `full_name` is classified personal data by `schema.md`, with one deliberate publication: a staff
 * member's name is the published signatory on a decision and the display name on a moderation action.
 * It is never joined into a public projection by any other path.
 *
 * `authorised_ward_ids` stays a text array rather than a join table because `schema.md` defines it as
 * a property of the staff user; the specification gives it no entity of its own. Entries are ward
 * identifiers and are validated by the action that writes them (`C-068`), not by a row per ward.
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { staffRole } from './enums.ts';
import { member } from './member.ts';
import { submission } from './submission.ts';
import { submissionDraft } from './submission-draft.ts';
import { decision } from './decision.ts';
import { decisionDraft } from './decision-draft.ts';
import { moderationAction } from './moderation-action.ts';
import { appeal } from './appeal.ts';
import { legalReview } from './legal-review.ts';
import { dataRequest } from './data-request.ts';
import { commitment } from './commitment.ts';
import { residenceReview } from './residence-review.ts';
import { commitmentStatusChange } from './commitment-status-change.ts';
import { deliveryEvidence } from './delivery-evidence.ts';
import { budgetLineMatch } from './budget-line-match.ts';
import { sessionQuestion } from './session-question.ts';
import { wardDescriptionReview } from './ward-description-review.ts';

export const staffUser = pgTable(
  'staff_user',
  {
    id: text('id').primaryKey(),
    /** Personal data. Published only as a decision signatory or a moderation display name. */
    fullName: varchar('full_name', { length: 160 }).notNull(),
    role: staffRole('role').notNull(),
    /** Whether the user sits outside the campaign. Required true for an external reviewer. */
    external: boolean('external').notNull(),
    /** For a ward organiser, the wards they may record in. */
    authorisedWardIds: text('authorised_ward_ids').array(),
    secondFactorEnrolled: boolean('second_factor_enrolled').notNull(),
    active: boolean('active').notNull(),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('staff_user_id_format', isIdentifier(t.id)),
    check(
      'staff_user_external_reviewer_outside',
      sql`${t.role} <> 'external_reviewer' or ${t.external} = true`,
    ),
  ],
);

export const staffUserRelations = relations(staffUser, ({ many }) => ({
  attestedMembers: many(member),
  recordedSubmissions: many(submission),
  recordedDrafts: many(submissionDraft),
  signedDecisions: many(decision),
  decisionDrafts: many(decisionDraft),
  moderationActions: many(moderationAction),
  relatedAppeals: many(appeal),
  legalReviews: many(legalReview),
  completedDataRequests: many(dataRequest),
  confirmedCommitments: many(commitment),
  conductedResidenceReviews: many(residenceReview),
  commitmentStatusChanges: many(commitmentStatusChange),
  deliveryEvidence: many(deliveryEvidence),
  budgetLineMatches: many(budgetLineMatch),
  sessionQuestions: many(sessionQuestion),
  resolvedWardDescriptions: many(wardDescriptionReview),
}));
