/**
 * The durable analytics identity convention (`C-089`, `C-001`).
 *
 * `C-089` types `user_id` as a `usr_` identifier, while the record names a member with `mbr_`. The
 * platform has two ways to reconcile that, and this module records the one it took:
 *
 * - **Mint and store an analytics identity.** The member would gain a second identifier column at
 *   registration. `schema.md` declares no such field, so this is a schema change, a migration and a
 *   backfill for every existing account — none of which this task owns.
 * - **Record the prefix translation as the convention**, which is what this module does and what the
 *   durable store assumes: the analytics user id is the member identifier's opaque body under the
 *   `usr_` prefix. Nothing is minted, nothing new is stored, and no mapping table exists to drift
 *   from the account it describes.
 *
 * The translation is safe for the life of the member and for deletion propagation. The body is the
 * one the member already has, so the value is stable; it reveals no field the account does not hold;
 * and a deletion request replaces the stored `usr_` value with a `tok_` token
 * (`analytics.replaceUserToken`) exactly as it would a minted id, so historical counts survive while
 * the event stops being attributable.
 *
 * A value that is not a member identifier is passed through unchanged rather than repaired, so the
 * envelope refuses it as `PATTERN_MISMATCH` and the dispatcher reports the refusal. The convention
 * never invents an identity, and an unattributable event cannot be stored as if it had one.
 */

/** The prefix `C-089` gives the analytics identity. */
export const ANALYTICS_USER_PREFIX = 'usr';

/** The analytics identity in the `C-001` form, as the envelope and the store both require it. */
export const ANALYTICS_USER_ID_PATTERN = /^usr_[0-9A-Z]{4,26}$/;

/** A member's record identifier, whose opaque body is the analytics identity's body too (`C-001`). */
const MEMBER_ID_PATTERN = /^mbr_([0-9A-Z]{4,26})$/;

/**
 * The analytics `user_id` of one member.
 *
 * @param memberId - The member's `mbr_` record identifier.
 * @returns The same opaque body under `usr_`, or the input unchanged when it is not a member
 * identifier, so the envelope refuses it rather than attributing it to an invented identity.
 */
export function analyticsUserIdFor(memberId: string): string {
  const match = MEMBER_ID_PATTERN.exec(memberId);
  return match === null ? memberId : `${ANALYTICS_USER_PREFIX}_${match[1]}`;
}
