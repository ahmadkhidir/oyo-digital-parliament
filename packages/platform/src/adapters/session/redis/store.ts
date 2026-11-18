/**
 * The {@link SessionStore} over the Redis command seam (`NFR-026`, `NFR-027`).
 *
 * The adapter validates the two things the seam cannot: a key is never empty and an entry never
 * exists without a positive, finite lifetime. It then translates a driver failure into
 * {@link SessionStoreUnavailableError}, so the caller refuses the operation rather than mistaking an
 * outage for an empty session or an unlimited counter.
 *
 * It carries no business rule: what a session means, when a code is spent and what a cap is belong to
 * the ports above it.
 *
 * @module adapters/session/redis/store
 */
import { SessionStoreUnavailableError, type SessionStore } from '../../../ports/session-store.ts';
import type { SessionRedisCommands } from './client.ts';

/** Require a positive whole second, because an entry without an expiry is a defect. */
function requireTtl(ttlSeconds: number): number {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new TypeError('a session store entry needs a positive whole-second lifetime');
  }
  return ttlSeconds;
}

/** Reject an empty key: it means a builder was bypassed. */
function requireKey(key: string): string {
  if (key === '') throw new TypeError('a session store key must not be empty');
  return key;
}

/** Wrap one command, mapping every driver failure onto the caller's stable cause. */
async function attempt<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof TypeError) throw error;
    throw new SessionStoreUnavailableError();
  }
}

/**
 * Create the session store.
 *
 * @param commands - The Redis command seam.
 */
export function createRedisSessionStore(commands: SessionRedisCommands): SessionStore {
  return {
    get: (key) => attempt(() => commands.get(requireKey(key))),

    set: (key, value, ttlSeconds) =>
      attempt(() => commands.setWithTtl(requireKey(key), value, requireTtl(ttlSeconds))),

    delete: (keys) =>
      attempt(async () => {
        const unique = [...new Set(keys.map(requireKey))];
        if (unique.length === 0) return 0;
        return commands.deleteMany(unique);
      }),

    increment: (key, ttlSeconds) =>
      attempt(() => commands.incrementWithTtl(requireKey(key), requireTtl(ttlSeconds))),

    ttl: (key) => attempt(() => commands.ttl(requireKey(key))),

    addToSet: (key, member, ttlSeconds) =>
      attempt(() => {
        if (member === '') throw new TypeError('a set member must not be empty');
        return commands.addToSet(requireKey(key), member, requireTtl(ttlSeconds));
      }),

    members: (key) => attempt(() => commands.readSet(requireKey(key))),

    removeFromSet: (key, members) =>
      attempt(async () => {
        const unique = [...new Set(members.map(requireKey))];
        if (unique.length === 0) return 0;
        return commands.removeFromSet(requireKey(key), unique);
      }),

    ping: () => commands.ping(),
  };
}
