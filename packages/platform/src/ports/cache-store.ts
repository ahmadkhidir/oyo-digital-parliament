/**
 * The cache seam (`NFR-001`, `C-075`, `C-086`).
 *
 * The read cache stores rendered pages, ward reports, the commitment register and rate-limit
 * counters. Every write states its expiry: there is no "set forever" operation, because a cached
 * figure without an expiry eventually serves a stale number as current. A caller that cannot reach
 * Redis falls back to PostgreSQL rather than treating a miss as an empty result.
 *
 * Values are strings at this seam; serialisation belongs to the read path that owns the shape.
 *
 * @module ports/cache-store
 */
/** A key-value store with mandatory expiry. */
export interface CacheStore {
  /** @returns The stored value, or `null` on a miss. */
  get(key: string): Promise<string | null>;

  /**
   * Store a value with an expiry.
   *
   * @param ttlSeconds - Positive, finite lifetime. A cache entry without one is refused, not
   *   quietly stored forever.
   */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /** @returns Whether the key existed and was removed. */
  delete(key: string): Promise<boolean>;

  /** @returns How many of the given keys existed and were removed. */
  deleteMany(keys: readonly string[]): Promise<number>;

  /**
   * Increment a counter and set its expiry when the counter is created.
   *
   * Used for rate-limit windows: the first increment starts the window, later ones do not extend it.
   *
   * @returns The counter after the increment.
   */
  increment(key: string, ttlSeconds: number): Promise<number>;

  /**
   * The remaining lifetime of a key.
   *
   * @returns Seconds remaining, `-1` for a key without an expiry, `-2` for a missing key. The
   *   last value is a defect worth surfacing: nothing here writes an infinite TTL.
   */
  ttl(key: string): Promise<number>;

  /** Whether the store answers. Used by readiness and by the fallback path. */
  ping(): Promise<boolean>;
}

/** The cache could not be reached. The caller falls back to the authoritative read. */
export class CacheUnavailableError extends Error {
  constructor() {
    super('the cache is unavailable');
    this.name = 'CacheUnavailableError';
  }
}
