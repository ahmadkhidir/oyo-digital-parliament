/**
 * The cache capability's adapter surface.
 *
 * The composition root imports this file rather than `./redis/...` directly, so the vendor name
 * stays inside `src/adapters/` (the import-boundary rule and `packages/platform/AGENTS.md`
 * Discipline) while the root still wires the one cache this deployment has.
 *
 * @module adapters/cache
 */
export { createRedisCacheStore } from './redis/adapter.ts';
export { createRedisConnection } from './redis/client.ts';
export type { RedisCacheCommands, RedisConnection } from './redis/client.ts';
export { createCacheInvalidator, currentGeneration } from './redis/invalidate.ts';
export { cacheKey, generationKey, pageVariant, requireQueryHash } from './redis/keys.ts';
