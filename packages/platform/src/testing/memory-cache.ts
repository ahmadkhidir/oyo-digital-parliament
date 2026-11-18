/**
 * The cache double (`NFR-001`).
 *
 * Implements the same `CacheStore` as the Redis adapter, including the rules that matter: every
 * entry has an expiry, a miss is `null`, and a counter starts its window when it is created. Time
 * comes from the injected clock, so a test advances past an expiry rather than sleeping and the
 * double is deterministic.
 *
 * @module testing/memory-cache
 */
import type { CacheStore } from '../ports/cache-store.ts';
import { createFixedClock, type FixedClock } from './fixed-clock.ts';

/** A cache store a test can inspect and move through time. */
export interface MemoryCache extends CacheStore {
  /** The clock the expiries are measured against. */
  readonly clock: FixedClock;
  /** The keys currently stored, whether or not they have expired. */
  keys(): readonly string[];
  /** Drop every entry and reset nothing else. */
  clear(): void;
}

interface Entry {
  readonly value: string;
  readonly expiresAt: number;
}

/** Reject an entry without a positive whole-second lifetime, exactly as the adapter does. */
function requireTtl(ttlSeconds: number): void {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new TypeError('a cache entry needs a positive whole-second lifetime');
  }
}

/** Create the double, optionally over a shared clock. */
export function createMemoryCache(options: { readonly clock?: FixedClock } = {}): MemoryCache {
  const clock = options.clock ?? createFixedClock();
  const entries = new Map<string, Entry>();

  const live = (key: string): Entry | null => {
    const entry = entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= clock.now().getTime()) {
      entries.delete(key);
      return null;
    }
    return entry;
  };

  return {
    clock,
    keys: () => [...entries.keys()],
    clear() {
      entries.clear();
    },

    async get(key) {
      return live(key)?.value ?? null;
    },

    async set(key, value, ttlSeconds) {
      requireTtl(ttlSeconds);
      entries.set(key, {
        value,
        expiresAt: clock.now().getTime() + ttlSeconds * 1000,
      });
    },

    async delete(key) {
      live(key);
      return entries.delete(key);
    },

    async deleteMany(keys) {
      let removed = 0;
      for (const key of keys) {
        live(key);
        if (entries.delete(key)) removed += 1;
      }
      return removed;
    },

    async increment(key, ttlSeconds) {
      requireTtl(ttlSeconds);
      const existing = live(key);
      const next = existing === null ? 1 : Number(existing.value) + 1;
      entries.set(key, {
        value: String(next),
        // The window starts at creation and does not slide on a later hit.
        expiresAt: existing?.expiresAt ?? clock.now().getTime() + ttlSeconds * 1000,
      });
      return next;
    },

    async ttl(key) {
      const entry = live(key);
      if (entry === null) return -2;
      return Math.ceil((entry.expiresAt - clock.now().getTime()) / 1000);
    },

    async ping() {
      return true;
    },
  };
}
