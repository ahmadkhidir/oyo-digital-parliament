/**
 * Rule (`schema.md` Rule).
 *
 * One published discussion rule, cited by every removal. `code` is what appears in the public
 * moderation log, so it is unique: two rules cannot quote the same public code.
 */
import { relations } from 'drizzle-orm';
import { boolean, check, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { moderationAction } from './moderation-action.ts';

export const rule = pgTable(
  'rule',
  {
    id: text('id').primaryKey(),
    /** The short public code quoted in the moderation log. */
    code: varchar('code', { length: 40 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    text: varchar('text', { length: 2000 }).notNull(),
    /** Whether the rule may be cited for a new removal. */
    active: boolean('active').notNull(),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('rule_id_format', isIdentifier(t.id)),
    // Read path: a moderation action cites a rule by its public code (`C-050`).
    uniqueIndex('rule_code_key').on(t.code),
  ],
);

export const ruleRelations = relations(rule, ({ many }) => ({
  moderationActions: many(moderationAction),
}));
