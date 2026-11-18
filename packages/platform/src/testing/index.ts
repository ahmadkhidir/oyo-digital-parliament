/**
 * The test doubles, exported through the `./testing` subpath.
 *
 * Never reachable from the package root: production code cannot import a double by accident, and a
 * double cannot ship in the application bundle (`packages/platform/AGENTS.md` Structure).
 *
 * @module testing
 */
export { createFixedClock, type FixedClock } from './fixed-clock.ts';
export {
  createDeterministicIds,
  identifierPortOf,
  type DeterministicIds,
} from './deterministic-ids.ts';
export { createFakeSms, type FakeSms, type ScriptedSmsResult } from './fake-sms.ts';
export { createMemoryObjectStore, type MemoryObjectStore } from './memory-object-store.ts';
export { createMemoryCache, type MemoryCache } from './memory-cache.ts';
export { smsEnvironment, validEnvironment } from './config-fixture.ts';
export {
  describeCacheStoreContract,
  describeIdentifierContract,
  describeObjectStorageContract,
  type CacheContractSubject,
} from './contracts.ts';
