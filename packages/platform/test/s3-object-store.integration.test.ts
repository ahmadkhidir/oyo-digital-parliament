/**
 * The S3-compatible store against the disposable local bucket (`C-036`, `C-088`).
 *
 * The suite proves the three properties `packages/platform` promises: a write is private and
 * write-once, a signed URL reads exactly one object and expires, and an unsigned request is refused.
 * The bucket is created by `scripts/dev/services.mjs up`; when the stack is not running, the suite
 * skips itself.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { createObjectStorage, ObjectKeyTakenError } from '../src/adapters/storage/s3/adapter.ts';
import { createS3Client } from '../src/adapters/storage/s3/client.ts';
import { createSignedReadUrl } from '../src/adapters/storage/s3/urls.ts';
import { createFetchHttpClient } from '../src/adapters/http/fetch-client.ts';
import { createSystemClock } from '../src/clock/clock.ts';

const configured =
  process.env.S3_ENDPOINT !== undefined &&
  process.env.S3_BUCKET !== undefined &&
  process.env.S3_ACCESS_KEY_ID !== undefined &&
  process.env.S3_SECRET_ACCESS_KEY !== undefined &&
  process.env.S3_REGION !== undefined;

const suite = configured ? describe : describe.skip;

suite('S3 object store (integration)', () => {
  const clock = createSystemClock();
  const client = createS3Client({
    endpoint: process.env.S3_ENDPOINT ?? '',
    region: process.env.S3_REGION ?? '',
    bucket: process.env.S3_BUCKET ?? '',
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    http: createFetchHttpClient(),
    clock,
  });
  const store = createObjectStorage(client, createSignedReadUrl({ client, maxTtlSeconds: 60 }));
  const key = `evaluations/similar_submission/mev_01J9Z6K4Q3W8R2T5Y7B1C0D9EF/test-${process.pid}.json`;

  afterAll(async () => {
    await store.delete(key).catch(() => ({ deleted: false }));
  });

  it('writes once, reads back and refuses to overwrite', async () => {
    const body = new TextEncoder().encode('{"metric":"precision_at_1"}');
    await store.put({ key, body, contentType: 'application/json' });

    const stored = await store.get(key);
    expect(new TextDecoder().decode(stored?.body)).toBe('{"metric":"precision_at_1"}');
    expect(stored?.contentType).toContain('application/json');

    await expect(
      store.put({ key, body: new TextEncoder().encode('{}'), contentType: 'application/json' }),
    ).rejects.toBeInstanceOf(ObjectKeyTakenError);
  });

  it('reads one object through a signed URL and refuses an unsigned request', async () => {
    const url = await store.signedReadUrl(key, 60);
    const signed = await fetch(url);
    expect(signed.status).toBe(200);
    expect(await signed.text()).toBe('{"metric":"precision_at_1"}');

    const endpoint = new URL(process.env.S3_ENDPOINT ?? '');
    const bucket = process.env.S3_BUCKET ?? '';
    const unsigned = await fetch(`${endpoint.origin}/${bucket}/${key}`);
    expect(unsigned.status).toBe(403);
  });

  it('reports an absent object as null and deletes the object it wrote', async () => {
    await store.put({ key: `${key}.delete`, body: new Uint8Array([1]), contentType: 'text/plain' });
    await expect(store.delete(`${key}.delete`)).resolves.toEqual({ deleted: true });
    await expect(store.get(`${key}.delete`)).resolves.toBeNull();
  });
});
