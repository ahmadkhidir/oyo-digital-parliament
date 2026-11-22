/**
 * The per-capability payload allow-list (`C-078`, `NFR-045`).
 *
 * A payload is assembled from these fields, never filtered from the caller's object. A field added
 * upstream therefore cannot leak by default: it is simply not copied. The direct identifiers below
 * are named so the boundary can report them in `removedFields` — the response a payload inspection
 * reproduces — rather than dropping them silently.
 *
 * @module deidentification/allow-list
 */
import type { CapabilityName } from '../gateway/contract.ts';

/**
 * The direct identifiers `C-078` names, plus the actor and actor-reference fields the contract's
 * envelope enumerates. Every one of them is personal data and is never copied into a payload.
 */
export const DIRECT_IDENTIFIER_FIELDS = [
  'fullName',
  'telephoneNumber',
  'displayName',
  'memberId',
  'authorId',
  'moderatorId',
  'reviewerId',
  'requestedById',
  'confirmedById',
] as const;

/** One direct identifier field name. */
export type DirectIdentifierField = (typeof DIRECT_IDENTIFIER_FIELDS)[number];

/**
 * The fields each capability may send to a provider (`C-079` to `C-082`).
 *
 * Only `ward_candidate` is registered in this release, but the table stays keyed by the contract's
 * capability names so the next capability adds a row rather than a second boundary.
 */
export const CAPABILITY_ALLOW_LIST: Readonly<Partial<Record<CapabilityName, readonly string[]>>> = {
  ward_candidate: ['description', 'localGovernmentArea', 'candidateLimit'],
};

/**
 * Values a capability needs structurally but must not receive from the caller.
 *
 * Omission is preferred; a constant is the fallback for a field whose absence would break the
 * provider's request shape. `ward_candidate` needs no substitute, so its entry is empty — and the
 * mechanism exists for the capability that does.
 */
export const CAPABILITY_SUBSTITUTIONS: Readonly<
  Partial<Record<CapabilityName, Readonly<Record<string, string>>>>
> = {
  ward_candidate: {},
};
