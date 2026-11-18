/**
 * The domain storage port over the S3-compatible client (`C-036`, `C-088`).
 *
 * It maps the client's named failures onto the caller's outcomes and adds nothing else: a missing
 * object is `null`, a taken key is a typed refusal, and a store that does not answer throws so the
 * caller can decide whether to degrade. No success is invented and no partial object is returned.
 *
 * @module adapters/storage/s3/adapter
 */
import type {
  ObjectStoragePort,
  ObjectWrite,
  StoredObject,
} from '../../../../../domain/src/ports/object-store.ts';
import {
  ObjectAlreadyExistsError,
  ObjectStoreUnavailableError,
  type ObjectStoreClient,
} from '../../../ports/object-store.ts';
import type { SignedReadUrl } from './urls.ts';

/** A write refused because the key already holds an artefact. Corrections use a new key. */
export class ObjectKeyTakenError extends Error {
  /** The key that is already occupied. Opaque, so it is safe to carry. */
  readonly key: string;

  constructor(key: string) {
    super('an artefact already exists at this key; a correction writes a new key');
    this.name = 'ObjectKeyTakenError';
    this.key = key;
  }
}

/**
 * Create the storage port.
 *
 * @param client - The S3-compatible client.
 * @param signedReadUrl - The bounded URL factory.
 */
export function createObjectStorage(
  client: ObjectStoreClient,
  signedReadUrl: SignedReadUrl,
): ObjectStoragePort {
  return {
    async put(object: ObjectWrite) {
      try {
        const { etag } = await client.put(object.key, object.body, object.contentType);
        return { key: object.key, etag };
      } catch (error) {
        if (error instanceof ObjectAlreadyExistsError) throw new ObjectKeyTakenError(object.key);
        if (error instanceof ObjectStoreUnavailableError) throw error;
        throw new ObjectStoreUnavailableError();
      }
    },

    async get(key): Promise<StoredObject | null> {
      const object = await client.get(key);
      if (object === null) return null;
      return {
        key,
        body: object.body,
        contentType: object.contentType,
        etag: object.etag,
      };
    },

    async delete(key) {
      return client.delete(key);
    },

    async signedReadUrl(key, ttlSeconds) {
      return signedReadUrl(key, ttlSeconds);
    },
  };
}
