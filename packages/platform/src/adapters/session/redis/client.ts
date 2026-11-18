/**
 * The Redis client for sessions, codes and counters (`NFR-026`, `NFR-027`).
 *
 * Only this file imports the `redis` package for this capability (`packages/platform/AGENTS.md`
 * Discipline: vendor SDKs stay inside `src/adapters/`). It exposes the nine operations the store
 * above it drives, each with its expiry rule, so the adapter validates arguments and maps failures
 * instead of composing raw commands.
 *
 * The connection is opened on the first command. A boot whose Redis is briefly unreachable still
 * starts: the session read reports `SERVICE_DEGRADED` and readiness says so, which is the behaviour
 * `C-007` requires. It is a connection of its own, not the cache's, so an eviction storm on cached
 * pages cannot take sign-in with it.
 *
 * @module adapters/session/redis/client
 */
import { createClient } from 'redis';

/** The operations the session store drives. */
export interface SessionRedisCommands {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  deleteMany(keys: readonly string[]): Promise<number>;
  incrementWithTtl(key: string, ttlSeconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  addToSet(key: string, member: string, ttlSeconds: number): Promise<void>;
  readSet(key: string): Promise<readonly string[]>;
  removeFromSet(key: string, members: readonly string[]): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** A connected command set, with the lifetime of the connection. */
export interface SessionRedisConnection {
  readonly commands: SessionRedisCommands;
  close(): Promise<void>;
}

/**
 * Connect to Redis for the session namespace.
 *
 * @param url - The validated `REDIS_URL`.
 */
export function createSessionRedisConnection(url: string): SessionRedisConnection {
  const client = createClient({
    url,
    // A store that refuses must fail fast: `C-007` treats an unreachable session store as a signed-out
    // caller, and `C-092` refuses the operation. Holding the request while the driver retries forever
    // turns a degraded sign-in into a hung one.
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) =>
        retries > 5 ? new Error('redis reconnect budget exhausted') : Math.min(retries * 200, 1000),
    },
  });
  let ready: Promise<unknown> | null = null;

  // node-redis emits `error` on a dropped connection; without a listener the process would crash. The
  // event can carry the connection URL, so it is swallowed rather than logged.
  client.on('error', () => {});

  const connect = (): Promise<unknown> => {
    ready ??= client.connect();
    return ready;
  };

  const commands: SessionRedisCommands = {
    async get(key) {
      await connect();
      return client.get(key);
    },
    async setWithTtl(key, value, ttlSeconds) {
      await connect();
      await client.set(key, value, { EX: ttlSeconds });
    },
    async deleteMany(keys) {
      if (keys.length === 0) return 0;
      await connect();
      return client.del([...keys]);
    },
    async incrementWithTtl(key, ttlSeconds) {
      await connect();
      // NX: only the creator sets the expiry, so a window or an attempt count never slides on a hit.
      await client.set(key, '0', { EX: ttlSeconds, NX: true });
      return client.incr(key);
    },
    async ttl(key) {
      await connect();
      return client.ttl(key);
    },
    async addToSet(key, member, ttlSeconds) {
      await connect();
      await client.sAdd(key, member);
      // Refreshed on every add: the index lives as long as the longest session it names.
      await client.expire(key, ttlSeconds);
    },
    async readSet(key) {
      await connect();
      return client.sMembers(key);
    },
    async removeFromSet(key, members) {
      if (members.length === 0) return 0;
      await connect();
      return client.sRem(key, [...members]);
    },
    async ping() {
      try {
        await connect();
        return (await client.ping()) === 'PONG';
      } catch {
        return false;
      }
    },
    async close() {
      try {
        await client.quit();
      } catch {
        client.destroy();
      }
    },
  };

  return { commands, close: () => commands.close() };
}
