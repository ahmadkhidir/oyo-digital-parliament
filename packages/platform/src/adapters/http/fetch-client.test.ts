/**
 * The HTTP transport seam (`packages/platform` Definition of Done: adapter tests run offline).
 *
 * The transport is proven against a scripted `fetch`: the request it builds, the body it returns, and
 * the two failures it distinguishes — a timeout and a connection failure.
 */
import { describe, expect, it } from 'vitest';

import { HttpTimeoutError, HttpTransportError } from '../../ports/http.ts';
import { createFetchHttpClient, type FetchLike } from './fetch-client.ts';

/** A fetch that records its call and returns the given status and body. */
function scriptedFetch(
  response: { status: number; body?: Uint8Array; headers?: Record<string, string> },
  calls: { url: string; init: Parameters<FetchLike>[1] }[] = [],
): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    const headers = new Map(Object.entries(response.headers ?? {}));
    return {
      status: response.status,
      headers: {
        forEach(callback) {
          for (const [key, value] of headers) callback(value, key);
        },
      },
      async arrayBuffer() {
        const body = response.body ?? new Uint8Array();
        return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
      },
    };
  };
}

describe('fetch HTTP client', () => {
  it('sends the request it was given and lower-cases the response headers', async () => {
    const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
    const http = createFetchHttpClient(
      scriptedFetch({ status: 201, body: new Uint8Array([1]), headers: { ETag: '"x"' } }, calls),
    );

    const response = await http.send({
      method: 'POST',
      url: 'https://sms.example.test/send',
      headers: { 'content-type': 'application/json' },
      body: new Uint8Array([7]),
      timeoutMs: 1000,
    });

    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toEqual({ 'content-type': 'application/json' });
    expect(response.status).toBe(201);
    expect(response.headers.etag).toBe('"x"');
    expect(response.body).toEqual(new Uint8Array([1]));
  });

  it('reports a timeout as a timeout', async () => {
    const http = createFetchHttpClient(async () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    });

    await expect(
      http.send({ method: 'GET', url: 'https://example.test', timeoutMs: 1 }),
    ).rejects.toBeInstanceOf(HttpTimeoutError);
  });

  it('reports a connection failure as a transport failure', async () => {
    const http = createFetchHttpClient(async () => {
      throw new TypeError('fetch failed');
    });

    await expect(
      http.send({ method: 'GET', url: 'https://example.test', timeoutMs: 1 }),
    ).rejects.toBeInstanceOf(HttpTransportError);
  });
});
