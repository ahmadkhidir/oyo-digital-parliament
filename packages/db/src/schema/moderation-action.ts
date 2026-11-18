/**
 * ModerationAction (`schema.md` ModerationAction).
 *
 * A removal, restoration or hold applied to a comment, with the rule that justified it and the review
 * state of the action. A removal without a rule is invalid on review (`FEAT-006`, `FEAT-011`), so the
 * database refuses one rather than relying on the caller: `rule_id` is required when `action` is
 * `remove`.
 *
 * `reason` is moderator-authored text about a comment; it can quote the removed content and is
 * therefore kept with the action, available to the reviewer and the log, never published.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { moderationActionKind, moderationReviewStatus } from './enums.ts';
import { comment } from './comment.ts';
import { staffUser } from './staff-user.ts';
import { rule } from './rule.ts';

export const moderationAction = pgTable(
  'moderation_action',
  {
    id: text('id').primaryKey(),
    commentId: text('comment_id')
      .notNull()
      .references(() => comment.id),
    moderatorId: text('moderator_id')
      .notNull()
      .references(() => staffUser.id),
    action: moderationActionKind('action').notNull(),
    /** Required for a removal; a removal without a cited rule is invalid on review. */
    ruleId: text('rule_id').references(() => rule.id),
    reason: varchar('reason', { length: 1000 }).notNull(),
    reviewStatus: moderationReviewStatus('review_status').notNull(),
    /** The external reviewer assigned to the case, when one is. */
    assignedReviewerId: text('assigned_reviewer_id').references(() => staffUser.id),
    /** The external reviewer who decided the case. */
    reviewerId: text('reviewer_id').references(() => staffUser.id),
    reviewReason: varchar('review_reason', { length: 1000 }),
    reviewedAt: utcTimestamp('reviewed_at'),
    occurredAt: utcTimestamp('occurred_at').notNull(),
  },
  (t) => [
    check('moderation_action_id_format', isIdentifier(t.id)),
    check(
      'moderation_action_rule_required',
      sql`${t.action} <> 'remove' or ${t.ruleId} is not null`,
    ),
    // Read path: the moderation queue's open cases, newest first (`C-049`).
    index('moderation_action_queue_idx').on(t.reviewStatus, t.occurredAt),
    // Read path: every action taken against one comment (`C-023`, `C-050`).
    index('moderation_action_comment_idx').on(t.commentId, t.occurredAt),
    // Read path: the cases assigned to one external reviewer (`C-051`).
    index('moderation_action_reviewer_idx').on(t.assignedReviewerId, t.reviewStatus),
  ],
);

export const moderationActionRelations = relations(moderationAction, ({ one }) => ({
  comment: one(comment, { fields: [moderationAction.commentId], references: [comment.id] }),
  moderator: one(staffUser, {
    relationName: 'moderation_actor',
    fields: [moderationAction.moderatorId],
    references: [staffUser.id],
  }),
  rule: one(rule, { fields: [moderationAction.ruleId], references: [rule.id] }),
  assignedReviewer: one(staffUser, {
    relationName: 'moderation_assigned_reviewer',
    fields: [moderationAction.assignedReviewerId],
    references: [staffUser.id],
  }),
  reviewer: one(staffUser, {
    relationName: 'moderation_reviewer',
    fields: [moderationAction.reviewerId],
    references: [staffUser.id],
  }),
}));
