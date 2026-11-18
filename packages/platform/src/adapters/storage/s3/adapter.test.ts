/**
 * The storage port over the S3 client (`C-036`, `C-088`).
 *
 * The shared storage contract runs against an in-memory implementation of the client seam, so the
 * adapter's mapping — a taken key, a missing object, a signed URL bound — is proven offline. The
 * successful path is also run through the real client with a scripted transport in `client.test.ts`.
 */
import { describe, expect, it } from 'vitest';

import { describeObjectStorageContract } from '../../../testing/contracts.ts';
import {
  ObjectAlreadyExistsError,
  ObjectStoreUnavailableError,
  type ObjectStoreClient,
  type StoredObjectResponse,
} from '../../../ports/object-store.ts';
import { createObjectStorage, ObjectKeyTakenError } from './adapter.ts';
import { createSignedReadUrl } from './urls.ts';

/** A client seam that behaves like a write-once store. */
function memoryClient(): ObjectStoreClient {
  const objects = new Map<string, StoredObjectResponse>();
  return {
    async put(key, body, contentType) {
      if (objects.has(key)) throw new ObjectAlreadyExistsError();
      objects.set(key, { body: Uint8Array.from(body), contentType, etag: '"memory"' });
      return { etag: '"memory"' };
    },
    async get(key) {
      const object = objects.get(key);
      return object === undefined ? null : { ...object, body: Uint8Array.from(object.body) };
    },
    async delete(key) {
      return { deleted: objects.delete(key) };
    },
    async presignGet(key, ttlSeconds) {
      return `http://store.test/${key}?expires=${ttlSeconds}`;
    },
  };
}

const create = () => {
  const client = memoryClient();
  const signedReadUrl = createSignedReadUrl({ client, maxTtlSeconds: 900 });
  return createObjectStorage(client, signedReadUrl);
};

describe('storage adapter', () => {
  it('maps a taken key onto the caller’s typed refusal', async () => {
    const store = create();
    await store.put({ key: 'a', body: new Uint8Array([1]), contentType: 'text/plain' });
    await expect(
      store.put({ key: 'a', body: new Uint8Array([2]), contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(ObjectKeyTakenError);
  });

  it('never turns an unavailable store into a missing object', async () => {
    const store = createObjectStorage(
      {
        put: async () => {
          throw new ObjectStoreUnavailableError();
        },
        get: async () => {
          throw new ObjectStoreUnavailableError();
        },
        delete: async () => {
          throw new ObjectStoreUnavailableError();
        },
        presignGet: async () => {
          throw new ObjectStoreUnavailableError();
        },
      },
      async () => 'url',
    );

    await expect(store.get('a')).rejects.toBeInstanceOf(ObjectStoreUnavailableError);
    await expect(
      store.put({ key: 'a', body: new Uint8Array([1]), contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(ObjectStoreUnavailableError);
  });

  it('refuses a signed URL longer than the deployment allows', async () => {
    const client = memoryClient();
    const signedReadUrl = createSignedReadUrl({ client, maxTtlSeconds: 900 });
    await expect(signedReadUrl('a', 901)).rejects.toThrow(/between 1 and 900 seconds/);
    await expect(signedReadUrl('a', 0)).rejects.toThrow(/between 1 and 900 seconds/);
    await expect(signedReadUrl('a')).resolves.toContain('expires=900');
  });
});

describeObjectStorageContract('s3 adapter', create);
