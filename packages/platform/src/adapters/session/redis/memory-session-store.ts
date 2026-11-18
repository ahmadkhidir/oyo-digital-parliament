/**
 * An in-memory {@link SessionStore} for the unit suites.
 *
 * Test support only: nothing in production imports this file, and the composition root never sees it.
 * Time comes from the injected clock, so a TTL, an eviction and a counter window are proven without
 * waiting. The real driver is exercised by the integration suite against disposable Redis.
 *
 * @module adapters/session/redis/memory-session-store
 */
import type { SessionStore } from '../../../ports/session-store.ts';
import type { FixedClock } from '../../../testing/fixed-clock.ts';

/** A store a test can inspect after the adapter has written to it. */
export interface MemorySessionStore extends SessionStore {
  /** Every key currently held, for an assertion that a personal value never became one. */
  keys(): readonly string[];
  /** The raw value of one key, for an assertion that a token or code was not stored. */
  raw(key: string): string | null;
}

interface Entry {
  readonly value: string;
  readonly expiresAt: number;
}

interface SetEntry {
  readonly members: Set<string>;
  readonly expiresAt: number;
}

/**
 * Create the double.
 *
 * @param clock - The clock that decides whether an entry is still live.
 */
export function createMemorySessionStore(clock: FixedClock): MemorySessionStore {
  const entries = new Map<string, Entry>();
  const sets = new Map<string, SetEntry>();

  const live = (key: string): Entry | null => {
    const entry = entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= clock.now().getTime()) {
      entries.delete(key);
      return null;
    }
    return entry;
  };

  const liveSet = (key: string): SetEntry | null => {
    const entry = sets.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= clock.now().getTime()) {
      sets.delete(key);
      return null;
    }
    return entry;
  };

  const requireTtl = (ttlSeconds: number): number => {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
      throw new TypeError('a session store entry needs a positive whole-second lifetime');
    }
    return ttlSeconds;
  };

  return {
    async get(key) {
      return live(key)?.value ?? null;
    },
    async set(key, value, ttlSeconds) {
      entries.set(key, {
        value,
        expiresAt: clock.now().getTime() + requireTtl(ttlSeconds) * 1000,
      });
    },
    async delete(keys) {
      let removed = 0;
      for (const key of keys) {
        if (entries.delete(key)) removed += 1;
        if (sets.delete(key)) removed += 1;
      }
      return removed;
    },
    async increment(key, ttlSeconds) {
      const existing = live(key);
      const value = existing === null ? 1 : Number(existing.value) + 1;
      entries.set(key, {
        value: String(value),
        expiresAt: existing?.expiresAt ?? clock.now().getTime() + requireTtl(ttlSeconds) * 1000,
      });
      return value;
    },
    async ttl(key) {
      const entry = live(key);
      if (entry === null) return -2;
      return Math.ceil((entry.expiresAt - clock.now().getTime()) / 1000);
    },
    async addToSet(key, member, ttlSeconds) {
      const existing = liveSet(key);
      const members = existing?.members ?? new Set<string>();
      members.add(member);
      sets.set(key, {
        members,
        expiresAt: clock.now().getTime() + requireTtl(ttlSeconds) * 1000,
      });
    },
    async members(key) {
      const entry = liveSet(key);
      return entry === null ? [] : [...entry.members];
    },
    async removeFromSet(key, members) {
      const entry = liveSet(key);
      if (entry === null) return 0;
      let removed = 0;
      for (const member of members) if (entry.members.delete(member)) removed += 1;
      return removed;
    },
    async ping() {
      return true;
    },
    keys() {
      return [...entries.keys(), ...sets.keys()];
    },
    raw(key) {
      return entries.get(key)?.value ?? null;
    },
  };
}
