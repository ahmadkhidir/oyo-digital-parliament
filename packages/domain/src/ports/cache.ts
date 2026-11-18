/**
 * Invalidating the read cache (`NFR-001`, `C-075`, `C-086`).
 *
 * The cache holds rendered public pages, ward reports, the commitment register and the ledger. It is
 * never the record: a miss or an unreachable Redis falls back to PostgreSQL. The domain's only need
 * is to say "this published fact changed, clear what depends on it" — the key builders, the
 * namespace and the TTLs live in `packages/platform`'s `keys.ts`, so no caller composes a key.
 *
 * A cache family is a fixed vocabulary, not a free string: an unknown family is a programming error
 * and invalidation of an unknown family must never silently clear nothing.
 */
export type CacheFamily =
  'public_page' | 'ward_report' | 'commitment_register' | 'public_ledger' | 'search_results';

/** What to clear: one family, scoped to one record or to the whole family. */
export interface CacheInvalidation {
  readonly family: CacheFamily;
  /**
   * The opaque identifier the family is scoped to — a ward id, a submission reference or a quarter.
   *
   * Omitted clears the whole family, which is what a publication with wide effects does. It is never
   * a telephone number, a name or free text.
   */
  readonly scopeId?: string;
}

/** The invalidation effect a publishing use case performs after its write commits. */
export interface CacheInvalidationPort {
  /**
   * Advance the generation of one family.
   *
   * A cache key embeds its family's generation (`packages/platform`'s `keys.ts`), so bumping the
   * counter makes every older copy unreachable in one write; the old entries then expire on their
   * own TTL. Nothing is scanned and nothing is deleted blind, which is why this operation is cheap
   * enough to call from a publication path.
   *
   * @param invalidation - The family and, where one applies, the record it is scoped to.
   * @returns The new generation. A caller that logged it can correlate a publication with the
   *   copies it superseded.
   * @throws when the cache is unreachable. The caller decides whether a stale page for one more
   *   minute is worth failing the publication; `C-075` and `C-086` say it is not, so the caller
   *   proceeds and the pre-warmer clears it on its next pass.
   */
  invalidate(invalidation: CacheInvalidation): Promise<{ readonly generation: number }>;
}
