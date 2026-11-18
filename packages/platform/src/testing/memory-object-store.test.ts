/**
 * The object-store double (`C-036`).
 *
 * Runs the shared storage contract, so the double and the S3 adapter agree on write-once, miss and
 * delete semantics.
 */
import { describe, expect, it } from 'vitest';

import { describeObjectStorageContract } from './contracts.ts';
import { createMemoryObjectStore } from './memory-object-store.ts';

describeObjectStorageContract('memory object store', () => createMemoryObjectStore());

describe('memory object store double', () => {
  it('returns a copy, so a caller cannot mutate what is stored', async () => {
    const store = createMemoryObjectStore();
    const body = new Uint8Array([1, 2]);
    await store.put({ key: 'k', body, contentType: 'text/plain' });
    body[0] = 9;

    const stored = await store.get('k');
    expect(stored?.body).toEqual(new Uint8Array([1, 2]));

    if (stored !== null) stored.body[1] = 9;
    await expect(store.get('k')).resolves.toMatchObject({ body: new Uint8Array([1, 2]) });
  });

  it('refuses to sign a key that does not exist', async () => {
    const store = createMemoryObjectStore();
    await expect(store.signedReadUrl('missing', 60)).rejects.toThrow(/does not exist/);
  });
});
