/**
 * DataRequest (`schema.md` DataRequest).
 *
 * A member's request to see, correct, export or delete what the platform holds about them.
 * `member_id` is personal data and is the subject of the request; it never enters an audit reason, a
 * search document, an analytics event or a cache payload. The request is not deleted when it is
 * completed: the rights log and the audit log both depend on it (`FEAT-012`, `NFR-040`).
 *
 * A completed request must carry `completed_at`; a deferred one must state the hold reason and its
 * review date, so a request cannot sit unresolved with no stated reason and the member is always told
 * when the hold is next looked at (`C-032`, `C-035`, `C-036`, `C-066`, `C-067`). The review date is a
 * structured column, not prose inside `legal_hold_note`: a screen renders a date, it does not parse
 * one out of a sentence.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { dataRequestStatus, dataRequestType } from './enums.ts';
import { member } from './member.ts';
import { staffUser } from './staff-user.ts';

export const dataRequest = pgTable(
  'data_request',
  {
    id: text('id').primaryKey(),
    /** Personal data: the member whose data the request concerns. */
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    type: dataRequestType('type').notNull(),
    status: dataRequestStatus('status').notNull(),
    /** When deferred, the reason for the legal hold and the date it is next reviewed. */
    legalHoldNote: varchar('legal_hold_note', { length: 500 }),
    /**
     * When the legal hold is next reviewed.
     *
     * Not personal data: it is a campaign working date, and the reason beside it stays in
     * `legal_hold_note`. Present exactly while the request is deferred (`schema.md` DataRequest,
     * `C-067`), because a member is told the date the hold is reviewed and the queue cannot record a
     * hold without one.
     */
    legalHoldReviewAt: utcTimestamp('legal_hold_review_at'),
    outcomeReason: varchar('outcome_reason', { length: 1000 }),
    /** The export file reference, once produced. */
    fileReference: varchar('file_reference', { length: 200 }),
    completedById: text('completed_by_id').references(() => staffUser.id),
    requestedAt: utcTimestamp('requested_at').notNull(),
    completedAt: utcTimestamp('completed_at'),
  },
  (t) => [
    check('data_request_id_format', isIdentifier(t.id)),
    check(
      'data_request_completion_time',
      sql`${t.status} <> 'completed' or ${t.completedAt} is not null`,
    ),
    check(
      'data_request_legal_hold_note',
      sql`${t.status} <> 'deferred_for_legal_hold' or ${t.legalHoldNote} is not null`,
    ),
    // `schema.md` DataRequest: the review date is present only while the request is deferred, and the
    // queue cannot record a hold without one (`C-067`, `screens/22-data-request-queue.md`).
    check(
      'data_request_legal_hold_review_at',
      sql`(${t.status} = 'deferred_for_legal_hold') = (${t.legalHoldReviewAt} is not null)`,
    ),
    check(
      'data_request_refusal_reason',
      sql`${t.status} <> 'refused' or ${t.outcomeReason} is not null`,
    ),
    // Read path: the operator's data-request queue (`C-066`) and the member's own request list (`C-032`).
    index('data_request_queue_idx').on(t.status, t.requestedAt),
    index('data_request_member_idx').on(t.memberId, t.requestedAt),
  ],
);

export const dataRequestRelations = relations(dataRequest, ({ one }) => ({
  member: one(member, { fields: [dataRequest.memberId], references: [member.id] }),
  completedBy: one(staffUser, {
    fields: [dataRequest.completedById],
    references: [staffUser.id],
  }),
}));
