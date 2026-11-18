/**
 * The session store over the Redis command seam (`NFR-026`, `NFR-027`).
 *
 * Proves the two guarantees the seam cannot make for itself: an entry always has a positive lifetime,
 * and a driver failure is reported as an unavailable store rather than as a miss or an empty set.
 */
import { describe, expect, it } from 'vitest';

import { SessionStoreUnavailableError } from '../../../ports/session-store.ts';
import type { SessionRedisCommands } from './client.ts';
import { createRedisSessionStore } from './store.ts';

function failingCommands(): SessionRedisCommands {
  const reject = async (): Promise<never> => {
    throw new Error('ECONNREFUSED');
  };
  return {
    get: reject,
    setWithTtl: reject,
    deleteMany: reject,
    incrementWithTtl: reject,
    ttl: reject,
    addToSet: reject,
    readSet: reject,
    removeFromSet: reject,
    ping: async () => false,
    close: async () => {},
  };
}

describe('redis session store', () => {
  it('maps a driver failure onto the session store’s own cause', async () => {
    const store = createRedisSessionStore(failingCommands());

    await expect(store.get('odp:v1:sess:member:x')).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
    await expect(store.set('odp:v1:sess:member:x', 'value', 60)).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
    await expect(store.increment('odp:v1:limit:sign_in:x:1', 60)).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
    await expect(store.addToSet('odp:v1:sess:staff-index:x', 'key', 60)).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
    await expect(store.members('odp:v1:sess:staff-index:x')).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
    await expect(store.ping()).resolves.toBe(false);
  });

  it('refuses an entry without a positive lifetime', async () => {
    const store = createRedisSessionStore(failingCommands());

    await expect(store.set('odp:v1:sess:member:x', 'value', 0)).rejects.toBeInstanceOf(TypeError);
    await expect(store.increment('odp:v1:limit:sign_in:x:1', 0)).rejects.toBeInstanceOf(TypeError);
  });

  it('does not send an empty key or an empty set change to the driver', async () => {
    const store = createRedisSessionStore(failingCommands());

    await expect(store.delete([])).resolves.toBe(0);
    await expect(store.removeFromSet('odp:v1:sess:staff-index:x', [])).resolves.toBe(0);
    await expect(store.get('')).rejects.toBeInstanceOf(TypeError);
  });
});
