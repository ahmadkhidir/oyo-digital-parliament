/**
 * SessionQuestion (`schema.md` SessionQuestion).
 *
 * A question offered for a session, whether it was selected, and the answer given. `question_text`
 * is the member's own words and becomes public only with the published session record; until then it
 * stays with the offering member and the response staff.
 */
import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { sessionQuestionOutcome } from './enums.ts';
import { session } from './session.ts';
import { member } from './member.ts';
import { staffUser } from './staff-user.ts';

export const sessionQuestion = pgTable(
  'session_question',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => session.id),
    memberId: text('member_id')
      .notNull()
      .references(() => member.id),
    /** The member's own words; published only with the session record. */
    questionText: varchar('question_text', { length: 1000 }).notNull(),
    selected: boolean('selected').notNull(),
    selectedById: text('selected_by_id').references(() => staffUser.id),
    selectedAt: utcTimestamp('selected_at'),
    outcome: sessionQuestionOutcome('outcome').notNull(),
    /** The answer given, in the campaign's words. */
    answerText: varchar('answer_text', { length: 2000 }),
    answeredById: text('answered_by_id').references(() => staffUser.id),
    answeredAt: utcTimestamp('answered_at'),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('session_question_id_format', isIdentifier(t.id)),
    check(
      'session_question_selection_complete',
      sql`${t.selected} = false or (${t.selectedById} is not null and ${t.selectedAt} is not null)`,
    ),
    check(
      'session_question_written_answer',
      sql`${t.outcome} <> 'answered_in_writing' or (${t.answerText} is not null and ${t.answeredById} is not null)`,
    ),
    // Read path: the selected set for the session composer (`C-063`, `C-064`).
    index('session_question_selection_idx').on(t.sessionId, t.selected),
    index('session_question_member_idx').on(t.memberId),
  ],
);

export const sessionQuestionRelations = relations(sessionQuestion, ({ one }) => ({
  session: one(session, { fields: [sessionQuestion.sessionId], references: [session.id] }),
  member: one(member, { fields: [sessionQuestion.memberId], references: [member.id] }),
  selectedBy: one(staffUser, {
    fields: [sessionQuestion.selectedById],
    references: [staffUser.id],
  }),
  answeredBy: one(staffUser, {
    fields: [sessionQuestion.answeredById],
    references: [staffUser.id],
  }),
}));
