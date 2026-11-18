/**
 * The object-store double (`C-036`, `C-088`).
 *
 * Implements the same `ObjectStoragePort` as the S3 adapter: write-once, not-found as `null`, and a
 * short-lived signed URL that never leaves the process. It is deterministic, holds objects in
 * memory, and passes the shared storage contract suite beside the adapter, so a signature or
 * failure-mapping change in one cannot land without the other.
 *
 * @module testing/memory-object-store
 */
import type {
  ObjectStoragePort,
  ObjectWrite,
  StoredObject,
} from '../../../domain/src/ports/object-store.ts';
import { ObjectKeyTakenError } from '../adapters/storage/s3/adapter.ts';
import { createFixedClock, type FixedClock } from './fixed-clock.ts';

/** The in-memory store, with the state a test may inspect. */
export interface MemoryObjectStore extends ObjectStoragePort {
  /** Whether a key is present. */
  has(key: string): boolean;
  /** How many objects are stored. */
  readonly size: number;
  /** The clock the signed URLs are derived from. */
  readonly clock: FixedClock;
  /** Remove everything, for a test that reuses one store. */
  clear(): void;
}

/**
 * Create the double.
 *
 * @param options - An optional clock, so a signed URL can be asserted at a pinned instant.
 */
export function createMemoryObjectStore(
  options: { readonly clock?: FixedClock } = {},
): MemoryObjectStore {
  const clock = options.clock ?? createFixedClock();
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();

  const store: MemoryObjectStore = {
    clock,
    get size() {
      return objects.size;
    },
    has: (key) => objects.has(key),
    clear() {
      objects.clear();
    },

    async put(object: ObjectWrite) {
      if (objects.has(object.key)) throw new ObjectKeyTakenError(object.key);
      objects.set(object.key, {
        body: Uint8Array.from(object.body),
        contentType: object.contentType,
      });
      return { key: object.key, etag: `"mem-${objects.size}"` };
    },

    async get(key): Promise<StoredObject | null> {
      const stored = objects.get(key);
      if (stored === undefined) return null;
      return {
        key,
        body: Uint8Array.from(stored.body),
        contentType: stored.contentType,
        etag: `"mem-${[...objects.keys()].indexOf(key) + 1}"`,
      };
    },

    async delete(key) {
      return { deleted: objects.delete(key) };
    },

    async signedReadUrl(key, ttlSeconds) {
      if (!objects.has(key)) throw new Error('cannot sign an object that does not exist');
      if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
        throw new Error('signed-URL lifetime must be a positive whole number of seconds');
      }
      const expires = Math.floor(clock.now().getTime() / 1000) + ttlSeconds;
      return `memory://object-store/${encodeURIComponent(key)}?expires=${expires}`;
    },
  };

  return store;
}
