/**
 * The cache store over the Redis command seam (`NFR-001`).
 *
 * The adapter validates the one thing the seam cannot: an entry is never written without a positive,
 * finite lifetime. It then translates a driver failure into {@link CacheUnavailableError} so the read
 * path takes its documented fallback to PostgreSQL instead of mistaking an outage for a miss with an
 * empty body.
 *
 * It carries no business rule: what a key means, when a page is stale and who invalidates it belong
 * to the read path and to `invalidate.ts`.
 *
 * @module adapters/cache/redis/adapter
 */
import { CacheUnavailableError, type CacheStore } from '../../../ports/cache-store.ts';
import type { RedisCacheCommands } from './client.ts';

/** Require a positive whole second, because a cache entry without an expiry is a defect. */
function requireTtl(ttlSeconds: number): number {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new TypeError('a cache entry needs a positive whole-second lifetime');
  }
  return ttlSeconds;
}

/** Reject an empty key: it means a builder was bypassed. */
function requireKey(key: string): string {
  if (key === '') throw new TypeError('a cache key must not be empty');
  return key;
}

/** Wrap one command, mapping every driver failure onto the caller's stable cause. */
async function attempt<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new CacheUnavailableError();
  }
}

/**
 * Create the cache store.
 *
 * @param commands - The Redis command seam.
 */
export function createRedisCacheStore(commands: RedisCacheCommands): CacheStore {
  return {
    get: (key) => attempt(() => commands.get(requireKey(key))),

    set: (key, value, ttlSeconds) =>
      attempt(() => commands.setWithTtl(requireKey(key), value, requireTtl(ttlSeconds))),

    delete: (key) => attempt(() => commands.delete(requireKey(key))),

    deleteMany: (keys) =>
      attempt(() => {
        const unique = [...new Set(keys.map(requireKey))];
        return commands.deleteMany(unique);
      }),

    increment: (key, ttlSeconds) =>
      attempt(() => commands.incrementWithTtl(requireKey(key), requireTtl(ttlSeconds))),

    ttl: (key) => attempt(() => commands.ttl(requireKey(key))),

    ping: () => commands.ping(),
  };
}
