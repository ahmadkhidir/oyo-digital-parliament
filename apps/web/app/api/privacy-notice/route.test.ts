/**
 * The ordinary-route half of the correlation rule and the `C-001` rate-limit signalling
 * (`C-001`, `C-091`, `NFR-027`).
 *
 * `GET /api/privacy-notice` stands in for every ordinary `/api` handler: it is public, it holds no
 * session, it consults no limiter and it parses one query value. A malformed `X-Correlation-Id` is
 * refused at the transport boundary before the runtime is touched; a read is answered in the
 * `C-001` envelope. Both answers carry the three rate-limit headers, the public read included.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { CORRELATION_ID_PATTERN } from '../../../lib/logging/correlation';
import { GET } from './route';

/** The runtime the handler reaches for on the read path only. */
const runtime = vi.hoisted(() => ({
  getMyRecordRuntime: vi.fn(async () => ({
    platform: { clock: { now: () => new Date('2026-11-18T09:00:30Z') } },
  })),
}));

// The refusal is decided before the runtime is reached; the mock proves it.
vi.mock('../../(record)/me/_lib/runtime', () => runtime);
vi.mock('../../../lib/i18n/locale', () => ({ resolveLocale: vi.fn(async () => 'en-NG') }));

/** Calling the wrapper as Next would, from a real `NextRequest`. */
function call(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(new NextRequest(url, { headers }));
}

describe('GET /api/privacy-notice (C-001, NFR-027)', () => {
  beforeEach(() => {
    runtime.getMyRecordRuntime.mockClear();
  });

  it('refuses a malformed X-Correlation-Id with the C-001 failure envelope', async () => {
    const response = await call('http://local/api/privacy-notice', {
      'x-correlation-id': 'not-a-correlation-id',
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: {
        code: string;
        cause: string;
        correlationId: string;
        fields: Record<string, string>;
      };
    };

    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.cause).toBe('CORRELATION_ID_INVALID');
    expect(body.error.fields).toEqual({ 'X-Correlation-Id': 'PATTERN_MISMATCH' });
    // A new value labels the refusal; the refused value is never echoed back.
    expect(body.error.correlationId).not.toBe('not-a-correlation-id');
    expect(body.error.correlationId).toMatch(CORRELATION_ID_PATTERN);
    expect(response.headers.get('x-correlation-id')).toBe(body.error.correlationId);
    // The refusal is the boundary's, decided without opening a database or a cache.
    expect(runtime.getMyRecordRuntime).not.toHaveBeenCalled();
  });

  it('carries the three rate-limit headers on a refusal', async () => {
    const response = await call('http://local/api/privacy-notice', {
      'x-correlation-id': 'not-a-correlation-id',
    });

    expect(response.headers.get('ratelimit-limit')).toBe('120');
    expect(response.headers.get('ratelimit-remaining')).toBe('120');
    expect(response.headers.get('ratelimit-reset')).toMatch(/^[0-9]+$/);
  });

  it('carries them on a normal public read too, with nothing consumed', async () => {
    const response = await call('http://local/api/privacy-notice');

    expect(response.status).toBe(200);
    expect(response.headers.get('ratelimit-limit')).toBe('120');
    expect(response.headers.get('ratelimit-remaining')).toBe('120');
    // The read allowance resets at the end of the current minute; the value is epoch seconds.
    const reset = Number(response.headers.get('ratelimit-reset'));
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(reset).toBeGreaterThan(nowSeconds);
    expect(reset).toBeLessThanOrEqual(nowSeconds + 61);

    const body = (await response.json()) as { data: { notice: { version: string } } };
    expect(body.data.notice.version).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/);
  });
});
