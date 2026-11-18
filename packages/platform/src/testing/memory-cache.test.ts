/**
 * The cache double (`NFR-001`).
 *
 * The memory store runs the same contract suite as the Redis adapter, so a change to the shared
 * cache behaviour cannot land in one and not the other. Time is advanced through the injected clock.
 */
import { describe, expect, it } from 'vitest';

import { describeCacheStoreContract } from './contracts.ts';
import { createFixedClock } from './fixed-clock.ts';
import { createMemoryCache } from './memory-cache.ts';

describeCacheStoreContract('memory cache', () => {
  const clock = createFixedClock();
  return { store: createMemoryCache({ clock }), clock };
});

describe('memory cache double', () => {
  it('starts a fresh instance empty', async () => {
    const cache = createMemoryCache();
    await expect(cache.get('anything')).resolves.toBeNull();
  });

  it('measures expiry against the injected clock', async () => {
    const clock = createFixedClock();
    const cache = createMemoryCache({ clock });
    await cache.set('key', 'value', 5);
    clock.advance(4_999);
    await expect(cache.get('key')).resolves.toBe('value');
    clock.advance(1);
    await expect(cache.get('key')).resolves.toBeNull();
  });
});
