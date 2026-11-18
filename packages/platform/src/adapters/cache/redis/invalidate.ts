/**
 * Cache invalidation by generation (`C-075`, `C-086`).
 *
 * A publication bumps the generation counter for the family and scope it changed; every key embeds
 * that generation, so the next read misses and rebuilds from PostgreSQL while the superseded entries
 * expire on their own. No key is scanned, no pattern is guessed and no personal value enters a key.
 *
 * Each family has exactly one trigger, and the caller names it:
 *
 * | Family | Advanced when |
 * |---|---|
 * | `public_page` | a submission, decision or commitment on that page is published or revised |
 * | `ward_report` | a ward report or one of its snapshots is published |
 * | `commitment_register` | a commitment changes status, or one is added or revised |
 * | `public_ledger` | a ledger entry is published or corrected |
 * | `search_results` | a submission is published, withdrawn or removed |
 *
 * A pre-warm pass (`C-086`) rebuilds the families it warms; it calls the same invalidation when a
 * cached copy is found stale, so there is one stale-detection path, not two.
 *
 * @module adapters/cache/redis/invalidate
 */
import type { CacheInvalidationPort } from '../../../../../domain/src/ports/cache.ts';
import type { CacheStore } from '../../../ports/cache-store.ts';
import { GLOBAL_SCOPE, GENERATION_TTL_SECONDS, generationKey } from './keys.ts';

/**
 * Create the invalidator.
 *
 * @param cache - The cache store. Its increment starts the generation key's lifetime when the key is
 *   created, so the counter is never stored without an expiry.
 */
export function createCacheInvalidator(cache: CacheStore): CacheInvalidationPort {
  return {
    async invalidate(invalidation) {
      const scope = invalidation.scopeId ?? GLOBAL_SCOPE;
      const key = generationKey(invalidation.family, scope);
      const generation = await cache.increment(key, GENERATION_TTL_SECONDS);
      return { generation };
    },
  };
}

/**
 * The generation a read should build its key from.
 *
 * @param cache - The cache store.
 * @param family - The read family.
 * @param scope - `global` or the opaque record identifier the family is scoped to.
 * @returns The current generation, or `0` when the family has never been invalidated.
 * @throws CacheUnavailableError when the cache cannot answer; the caller reads the authority rather
 *   than serving a stale page as current.
 */
export async function currentGeneration(
  cache: CacheStore,
  family: Parameters<typeof generationKey>[0],
  scope: string,
): Promise<number> {
  const key = generationKey(family, scope);
  const raw = await cache.get(key);
  if (raw === null) return 0;
  const generation = Number(raw);
  if (!Number.isSafeInteger(generation) || generation < 0) {
    // A corrupt counter is treated as a cold cache: rebuilding is cheaper than trusting it.
    return 0;
  }
  return generation;
}
