/**
 * The Redis client and its capability-level seam (`NFR-001`, `C-086`).
 *
 * Only this file imports the `redis` package (`packages/platform/AGENTS.md` Discipline: vendor SDKs
 * stay inside `src/adapters/`). It exposes the six operations the cache needs, each with its expiry
 * rule baked in, so the adapter above it validates arguments and maps failures rather than driving
 * raw commands.
 *
 * The increment is created with its expiry in one `SET … EX … NX`, then incremented. A counter
 * therefore never exists without an expiry, even if the process dies between the two calls, and a
 * later increment does not extend the window.
 *
 * @module adapters/cache/redis/client
 */
import { createClient } from 'redis';

/** The operations the cache adapter drives. */
export interface RedisCacheCommands {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteMany(keys: readonly string[]): Promise<number>;
  incrementWithTtl(key: string, ttlSeconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/** A connected Redis command set, with the lifetime of the connection. */
export interface RedisConnection {
  readonly commands: RedisCacheCommands;
  close(): Promise<void>;
}

/**
 * Connect to Redis.
 *
 * The connection is opened on the first command, so constructing the platform bundle does not fail a
 * boot whose cache is briefly unreachable — readiness reports it instead, and a read falls back to
 * the database.
 *
 * @param url - The validated `REDIS_URL`.
 */
export function createRedisConnection(url: string): RedisConnection {
  const client = createClient({
    url,
    // A refused cache must fail fast and let the read path fall back to PostgreSQL, not hold the
    // request while the driver retries forever. Five attempts at a short delay is enough to ride out
    // a restart; after that the cache is reported unavailable and readiness says so.
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) =>
        retries > 5 ? new Error('redis reconnect budget exhausted') : Math.min(retries * 200, 1000),
    },
  });
  let ready: Promise<unknown> | null = null;

  // node-redis emits `error` for a dropped connection; without a listener the process would crash.
  // The event carries no application data, and the message is not surfaced because it can include
  // the connection URL.
  client.on('error', () => {});

  const connect = (): Promise<unknown> => {
    ready ??= client.connect();
    return ready;
  };

  const commands: RedisCacheCommands = {
    async get(key) {
      await connect();
      return client.get(key);
    },
    async setWithTtl(key, value, ttlSeconds) {
      await connect();
      await client.set(key, value, { EX: ttlSeconds });
    },
    async delete(key) {
      await connect();
      return (await client.del(key)) > 0;
    },
    async deleteMany(keys) {
      if (keys.length === 0) return 0;
      await connect();
      return client.del([...keys]);
    },
    async incrementWithTtl(key, ttlSeconds) {
      await connect();
      // NX: only the creator sets the expiry, so a window does not slide on every hit.
      await client.set(key, '0', { EX: ttlSeconds, NX: true });
      return client.incr(key);
    },
    async ttl(key) {
      await connect();
      return client.ttl(key);
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
