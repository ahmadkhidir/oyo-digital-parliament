/**
 * Redis against the disposable local stack (`NFR-001`, `C-086`).
 *
 * Proves the real driver honours TTL and the fixed counting window, and that an unreachable Redis is
 * reported as unavailable rather than as a miss. Every key this suite writes carries a unique test
 * prefix and is removed afterwards.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { createRedisConnection } from '../src/adapters/cache/redis/client.ts';
import { createRedisCacheStore } from '../src/adapters/cache/redis/adapter.ts';
import { cacheKey } from '../src/adapters/cache/redis/keys.ts';
import { CacheUnavailableError } from '../src/ports/cache-store.ts';

const url = process.env.REDIS_URL;
const suite = url === undefined ? describe.skip : describe;
const prefix = `odp:v1:public_page:global:v0:test-${process.pid}`;

suite('Redis cache adapter (integration)', () => {
  const connection = createRedisConnection(url ?? 'redis://127.0.0.1:6379');
  const store = createRedisCacheStore(connection.commands);

  afterAll(async () => {
    await store.deleteMany([prefix, `${prefix}-counter`]);
    await connection.close();
  });

  it('stores a value with a TTL and expires it', async () => {
    await store.set(prefix, 'rendered', 2);
    await expect(store.get(prefix)).resolves.toBe('rendered');
    await expect(store.ttl(prefix)).resolves.toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 2100));
    await expect(store.get(prefix)).resolves.toBeNull();
  });

  it('counts within one window and keeps the lifetime on a second hit', async () => {
    const key = `${prefix}-counter`;
    await expect(store.increment(key, 30)).resolves.toBe(1);
    const ttl = await store.ttl(key);
    await expect(store.increment(key, 30)).resolves.toBe(2);
    await expect(store.ttl(key)).resolves.toBeLessThanOrEqual(ttl);
  });

  it('reports an unreachable Redis as unavailable, never as a miss', async () => {
    const offline = createRedisConnection('redis://127.0.0.1:1');
    const failing = createRedisCacheStore(offline.commands);
    try {
      await expect(failing.get('odp:v1:public_page:global:v0:offline')).rejects.toBeInstanceOf(
        CacheUnavailableError,
      );
    } finally {
      await offline.close();
    }
  });

  it('builds keys with the documented namespace', async () => {
    const key = cacheKey({
      family: 'public_page',
      scope: 'global',
      generation: 0,
      variant: 'record-home~en-ng',
    });
    await store.set(key, 'page', 30);
    await expect(store.get(key)).resolves.toBe('page');
    await store.delete(key);
  });
});
