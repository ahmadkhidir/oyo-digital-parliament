/**
 * The S3-compatible client (`C-036`).
 *
 * Every case runs against a scripted HTTP transport, so the suite proves the request the client
 * builds — method, URL, signed headers, body, the write-once guard — and the mapping of each status.
 * No socket is opened and no bucket is touched.
 */
import { describe, expect, it } from 'vitest';

import { createFixedClock } from '../../../testing/fixed-clock.ts';
import type { HttpClient, HttpRequest, HttpResponse } from '../../../ports/http.ts';
import {
  ObjectAlreadyExistsError,
  ObjectStoreUnavailableError,
} from '../../../ports/object-store.ts';
import { createS3Client, type S3ClientConfig } from './client.ts';

interface ScriptedHttp extends HttpClient {
  readonly requests: readonly HttpRequest[];
}

/** A transport that returns the next scripted response and records the request. */
function scriptedHttp(...responses: HttpResponse[]): ScriptedHttp {
  const requests: HttpRequest[] = [];
  return {
    requests,
    async send(request) {
      requests.push(request);
      const response = responses.shift();
      if (response === undefined) throw new Error('no scripted response left');
      return response;
    },
  };
}

const config = (http: HttpClient, overrides: Partial<S3ClientConfig> = {}): S3ClientConfig => ({
  endpoint: 'http://127.0.0.1:9100',
  region: 'us-east-1',
  bucket: 'odp-local',
  accessKeyId: 'odp-local-access-key',
  secretAccessKey: 'odp-local-secret-key',
  forcePathStyle: true,
  http,
  clock: createFixedClock('2026-11-18T09:00:00Z'),
  ...overrides,
});

const empty = (status: number, headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers,
  body: new Uint8Array(),
});

describe('S3 client', () => {
  it('puts one object with a signed write-once request', async () => {
    const http = scriptedHttp(empty(200, { etag: '"abc"' }));
    const client = createS3Client(config(http));

    const result = await client.put('exports/request/x', new Uint8Array([1, 2]), 'text/plain');

    expect(result.etag).toBe('"abc"');
    const [request] = http.requests;
    expect(request?.method).toBe('PUT');
    expect(request?.url).toBe('http://127.0.0.1:9100/odp-local/exports/request/x');
    expect(request?.headers?.['if-none-match']).toBe('*');
    expect(request?.headers?.['content-type']).toBe('text/plain');
    expect(request?.headers?.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=odp-local-access-key\/20261118\/us-east-1\/s3\/aws4_request, /,
    );
    expect(request?.body).toEqual(new Uint8Array([1, 2]));
  });

  it('refuses a second write at the same key', async () => {
    const http = scriptedHttp(empty(412));
    const client = createS3Client(config(http));
    await expect(
      client.put('exports/request/x', new Uint8Array([1]), 'text/plain'),
    ).rejects.toBeInstanceOf(ObjectAlreadyExistsError);
  });

  it('reads an object and reports an absent key as null', async () => {
    const http = scriptedHttp(
      {
        status: 200,
        headers: { 'content-type': 'application/json', etag: '"e"' },
        body: new TextEncoder().encode('{"ok":true}'),
      },
      empty(404),
    );
    const client = createS3Client(config(http));

    const object = await client.get('report-cards/2026-Q4/x');
    expect(object?.contentType).toBe('application/json');
    expect(new TextDecoder().decode(object?.body)).toBe('{"ok":true}');

    await expect(client.get('report-cards/2026-Q4/missing')).resolves.toBeNull();
  });

  it('deletes an object and reports whether the key existed', async () => {
    const http = scriptedHttp(empty(204), empty(404));
    const client = createS3Client(config(http));
    await expect(client.delete('handover/x/1')).resolves.toEqual({ deleted: true });
    await expect(client.delete('handover/x/1')).resolves.toEqual({ deleted: false });
  });

  it('reports a provider failure rather than inventing a result', async () => {
    const http = scriptedHttp(empty(500));
    const client = createS3Client(config(http));
    await expect(client.get('exports/request/x')).rejects.toBeInstanceOf(
      ObjectStoreUnavailableError,
    );
  });

  it('addresses a virtual-host bucket when path style is off', async () => {
    const http = scriptedHttp(empty(200, { etag: '"e"' }));
    const client = createS3Client(
      config(http, { endpoint: 'https://s3.example.test', forcePathStyle: false }),
    );
    await client.put('a/b', new Uint8Array([1]), 'text/plain');
    expect(http.requests[0]?.url).toBe('https://odp-local.s3.example.test/a/b');
  });

  it('mints a presigned URL without sending a request', async () => {
    const http = scriptedHttp();
    const client = createS3Client(config(http));
    const url = await client.presignGet('exports/request/x', 60);

    expect(http.requests).toHaveLength(0);
    expect(url).toContain('http://127.0.0.1:9100/odp-local/exports/request/x?');
    expect(url).toContain('X-Amz-Expires=60');
    expect(url).toContain('X-Amz-Signature=');
  });
});
