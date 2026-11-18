/**
 * The published discussion rules the platform seeds (`schema.md` Rule, `FEAT-006`).
 *
 * `FEAT-006` fixes the substance rather than the wording: the rules must permit criticism of the
 * candidate, the campaign and a decision, forbid personal abuse and threats, and hold an unverified
 * allegation against a named person or company for legal review. Every removal cites one of these
 * records by its public `code`, so the code is short, stable and never reused.
 *
 * The text below is the platform's publication of those rules. A rule that is retired later stays
 * readable in past removals and is marked inactive; it is never deleted and its code is never
 * reassigned.
 */
import { createHash } from 'node:crypto';

/** One published rule as the seed inserts it. */
export interface RuleSeedRow {
  readonly id: string;
  readonly code: string;
  readonly title: string;
  readonly text: string;
  readonly active: boolean;
  readonly createdAt: string;
}

/** The instant recorded on every seeded rule: the date this rule set was published. */
export const RULE_RECORDED_AT = '2026-11-18T00:00:00Z';

/**
 * The published discussion rules.
 *
 * `R-1` states what is allowed. It can be shown beside a removal and quoted by an author, but it
 * never justifies one: a comment cannot be removed for criticising the candidate or a decision.
 */
export const DISCUSSION_RULES: readonly Omit<RuleSeedRow, 'id' | 'createdAt' | 'active'>[] = [
  {
    code: 'R-1',
    title: 'Criticism is allowed',
    text: 'The candidate, the campaign and every decision can be criticised here, including sharply. Calling a promise wrong or a decision a mistake is not a breach of these rules, and a comment is never removed for being critical.',
  },
  {
    code: 'R-2',
    title: 'No personal abuse',
    text: 'Argue against what a person said or decided, not against the person. Insulting or abusing someone in a thread is removed.',
  },
  {
    code: 'R-3',
    title: 'No threats',
    text: 'Do not threaten anyone with violence or harm. A comment that threatens is removed.',
  },
  {
    code: 'R-4',
    title: 'No unverified allegations against named people or companies',
    text: 'Do not publish an allegation against a named person or company without a public source for it. A comment that names a person or company in an allegation is held for legal review before it appears, and the author is told it is held.',
  },
] as const;

/**
 * The stable identifier for a seeded rule.
 *
 * Deterministic, so two runs write the same row, and opaque, so nothing about the rule can be read
 * off the identifier (`C-001`).
 */
export function ruleIdentifier(code: string): string {
  const digest = createHash('sha256')
    .update(`rule:${code}`, 'utf8')
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
  return `rul_${digest}`;
}

/** Builds the Rule rows the seed inserts, in publication order. */
export function ruleSeedRows(): RuleSeedRow[] {
  return DISCUSSION_RULES.map((rule) => ({
    id: ruleIdentifier(rule.code),
    code: rule.code,
    title: rule.title,
    text: rule.text,
    active: true,
    createdAt: RULE_RECORDED_AT,
  }));
}
