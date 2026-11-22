/**
 * The HTTP adapter (`C-078`, `NFR-045`).
 *
 * Every answer is scripted; no test opens a connection. What matters here is the mapping: a refusal,
 * a provider limit, a malformed body and an abort each reach the gateway as a typed failure, never as
 * an empty success.
 */
import { describe, expect, it, vi } from 'vitest';

import { jsonResponse, providerBody } from '../../../test/support.ts';
import type { ModelAdapterRequest } from '../types.ts';
import { createHttpModelAdapter } from './adapter.ts';

const request: ModelAdapterRequest = {
  capability: 'ward_candidate',
  modelVersion: 'odp-ward-test-1',
  instructionVersion: 'ward-candidate-2026-08-1',
  instruction: 'Rank the wards.',
  payload: { description: 'Agbowo', candidateLimit: 3 },
  timeoutMs: 1500,
  signal: new AbortController().signal,
};

describe('createHttpModelAdapter', () => {
  it('posts the de-identified payload and the pinned version', async () => {
    let capturedBody = '';
    let capturedUrl = '';
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = String(init?.body);
      return jsonResponse(providerBody({ candidates: [] }), 200);
    }) as typeof fetch;

    const adapter = createHttpModelAdapter({
      url: 'https://model.example.test/v1',
      apiKey: 'test-key',
      fetch: fetchImpl,
    });

    await expect(adapter.send(request)).resolves.toEqual({
      outcome: 'ok',
      raw: { candidates: [] },
      usage: { units: 10 },
    });

    expect(capturedUrl).toBe('https://model.example.test/v1');
    const body = JSON.parse(capturedBody) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'odp-ward-test-1',
      capability: 'ward_candidate',
      instructionVersion: 'ward-candidate-2026-08-1',
      payload: { description: 'Agbowo', candidateLimit: 3 },
    });
    expect(capturedBody).not.toContain('test-key');
  });

  it('reports a refusal as refused', async () => {
    const adapter = createHttpModelAdapter({
      url: 'https://model.example.test/v1',
      apiKey: 'test-key',
      fetch: (async () => jsonResponse({ refused: true }, 200)) as unknown as typeof fetch,
    });
    await expect(adapter.send(request)).resolves.toEqual({
      outcome: 'refused',
      cause: 'PROVIDER_REFUSED',
      usage: null,
    });
  });

  it('reports a provider rate limit and an unusable status as errors', async () => {
    const limited = createHttpModelAdapter({
      url: 'https://model.example.test/v1',
      apiKey: 'test-key',
      fetch: (async () => jsonResponse({}, 429)) as unknown as typeof fetch,
    });
    await expect(limited.send(request)).resolves.toEqual({
      outcome: 'error',
      cause: 'PROVIDER_RATE_LIMITED',
      usage: null,
    });

    const unavailable = createHttpModelAdapter({
      url: 'https://model.example.test/v1',
      apiKey: 'test-key',
      fetch: (async () => jsonResponse({}, 503)) as unknown as typeof fetch,
    });
    await expect(unavailable.send(request)).resolves.toEqual({
      outcome: 'error',
      cause: 'PROVIDER_UNAVAILABLE',
      usage: null,
    });
  });

  it('reports a body without output as malformed rather than empty success', async () => {
    const adapter = createHttpModelAdapter({
      url: 'https://model.example.test/v1',
      apiKey: 'test-key',
      fetch: (async () => jsonResponse({ usage: { units: 3 } }, 200)) as unknown as typeof fetch,
    });
    await expect(adapter.send(request)).resolves.toEqual({
      outcome: 'error',
      cause: 'MALFORMED_OUTPUT',
      usage: { units: 3 },
    });
  });

  it('reports a transport failure as unavailable', async () => {
    const adapter = createHttpModelAdapter({
      url: 'https://model.example.test/v1',
      apiKey: 'test-key',
      fetch: (async () => {
        throw new Error('socket closed');
      }) as unknown as typeof fetch,
    });
    await expect(adapter.send(request)).resolves.toEqual({
      outcome: 'error',
      cause: 'PROVIDER_UNAVAILABLE',
      usage: null,
    });
  });

  it('reports the gateway deadline as a timeout', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    ) as unknown as typeof fetch;

    const adapter = createHttpModelAdapter({
      url: 'https://model.example.test/v1',
      apiKey: 'test-key',
      fetch: fetchImpl,
    });

    const pending = adapter.send({ ...request, signal: controller.signal, timeoutMs: 100 });
    controller.abort();
    await expect(pending).resolves.toEqual({ outcome: 'timeout', cause: 'TIMEOUT', usage: null });
  });
});
