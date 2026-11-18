/**
 * The reason field's guard (`C-090`, `NFR-028`).
 *
 * `schema.md` allows `reason` up to 1000 characters and it must stay readable: "Commit published
 * against ODP-004821." is the intended shape. What it must not become is a second copy of the data the
 * log protects, so a reason that reproduces a telephone number, an email address or a pasted block of
 * the item is refused and the append fails. A refused append means the state change does not happen,
 * which is the point: an unaudited change is not permitted, and a log that leaks is worse than no log.
 *
 * A person's name cannot be recognised by pattern. That case is held by the rule that a reason is
 * written from a template naming identifiers rather than by copying the item, and by the reviewer who
 * reads the log. The detectors below cover what a machine can prove, and the telephone rule is shared
 * with the analytics envelope so the two cannot drift apart.
 */
import { containsTelephoneNumber } from '../analytics/personal-data.ts';

/** A quoted span at least this long is a pasted excerpt, not a citation. */
const QUOTED_EXCERPT_LENGTH = 60;

/** Why a reason was refused. */
export type ReasonFinding = 'TELEPHONE_NUMBER' | 'EMAIL_ADDRESS' | 'QUOTED_EXCERPT';

/**
 * Checks one reason string.
 *
 * @returns the finding, or `null` when the reason is an identifier-bearing statement.
 */
export function findReasonFinding(reason: string): ReasonFinding | null {
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(reason)) return 'EMAIL_ADDRESS';
  if (containsTelephoneNumber(reason)) return 'TELEPHONE_NUMBER';
  // Both straight and curly quotation marks are matched, because a pasted excerpt can carry either.
  if (new RegExp(`["\u201C][^"\u201D]{${QUOTED_EXCERPT_LENGTH},}["\u201D]`).test(reason))
    return 'QUOTED_EXCERPT';
  return null;
}
