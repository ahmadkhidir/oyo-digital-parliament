/**
 * The Redis cache adapter (`NFR-001`, `C-086`).
 *
 * The command seam is implemented in memory so the suite stays offline: it proves the mandatory TTL,
 * the miss semantics, the fixed counting window and the failure mapping. The real driver is exercised
 * by the integration suite against disposable Redis.
 */
import { describe, expect, it } from 'vitest';

import { describeCacheStoreContract } from '../../../testing/contracts.ts';
import { createFixedClock, type FixedClock } from '../../../testing/fixed-clock.ts';
import { CacheUnavailableError } from '../../../ports/cache-store.ts';
import { createRedisCacheStore } from './adapter.ts';
import type { RedisCacheCommands } from './client.ts';

/** An in-memory Redis command seam. */
function memoryCommands(clock: FixedClock): RedisCacheCommands {
  const entries = new Map<string, { value: string; expiresAt: number }>();

  const live = (key: string): { value: string; expiresAt: number } | null => {
    const entry = entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= clock.now().getTime()) {
      entries.delete(key);
      return null;
    }
    return entry;
  };

  return {
    async get(key) {
      return live(key)?.value ?? null;
    },
    async setWithTtl(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: clock.now().getTime() + ttlSeconds * 1000 });
    },
    async delete(key) {
      live(key);
      return entries.delete(key);
    },
    async deleteMany(keys) {
      let removed = 0;
      for (const key of keys) if (await this.delete(key)) removed += 1;
      return removed;
    },
    async incrementWithTtl(key, ttlSeconds) {
      const existing = live(key);
      const value = existing === null ? 1 : Number(existing.value) + 1;
      entries.set(key, {
        value: String(value),
        expiresAt: existing?.expiresAt ?? clock.now().getTime() + ttlSeconds * 1000,
      });
      return value;
    },
    async ttl(key) {
      const entry = live(key);
      if (entry === null) return -2;
      return Math.ceil((entry.expiresAt - clock.now().getTime()) / 1000);
    },
    async ping() {
      return true;
    },
    async close() {},
  };
}

const create = () => {
  const clock = createFixedClock();
  return { store: createRedisCacheStore(memoryCommands(clock)), clock };
};

describe('redis cache adapter', () => {
  it('reports a driver failure as an unavailable cache, not a miss', async () => {
    const failing: RedisCacheCommands = {
      get: async () => {
        throw new Error('ECONNREFUSED');
      },
      setWithTtl: async () => {
        throw new Error('ECONNREFUSED');
      },
      delete: async () => {
        throw new Error('ECONNREFUSED');
      },
      deleteMany: async () => {
        throw new Error('ECONNREFUSED');
      },
      incrementWithTtl: async () => {
        throw new Error('ECONNREFUSED');
      },
      ttl: async () => {
        throw new Error('ECONNREFUSED');
      },
      ping: async () => false,
      close: async () => {},
    };

    const store = createRedisCacheStore(failing);
    await expect(store.get('a')).rejects.toBeInstanceOf(CacheUnavailableError);
    await expect(store.set('a', 'b', 10)).rejects.toBeInstanceOf(CacheUnavailableError);
    await expect(store.ping()).resolves.toBe(false);
  });
});

describeCacheStoreContract('redis cache adapter', create);
