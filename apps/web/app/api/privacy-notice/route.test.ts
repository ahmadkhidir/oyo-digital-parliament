/**
 * The ordinary-route half of the correlation rule (`C-001`, `C-091`).
 *
 * `GET /api/privacy-notice` stands in for every ordinary `/api` handler: it is public, it holds no
 * session and it parses one query value, so a malformed `X-Correlation-Id` is the only input in play.
 * The refusal must happen at the transport boundary, before the locale, the runtime or any domain
 * read is touched, and it must carry a minted identifier rather than the value it refused.
 */
import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { CORRELATION_ID_PATTERN } from '../../../lib/logging/correlation';
import { GET } from './route';

// The refusal is decided before either dependency is reached; the mocks keep the route importable
// without a database handle or a Next request store.
vi.mock('../../(record)/me/_lib/runtime', () => ({ getMyRecordRuntime: vi.fn() }));
vi.mock('../../../lib/i18n/locale', () => ({ resolveLocale: vi.fn(async () => 'en-NG') }));

describe('GET /api/privacy-notice (C-001)', () => {
  it('refuses a malformed X-Correlation-Id with the C-001 failure envelope', async () => {
    const request = new Request('http://local/api/privacy-notice', {
      headers: { 'x-correlation-id': 'not-a-correlation-id' },
    });

    const response = await GET(request as unknown as NextRequest);
    if (response === undefined) throw new Error('expected a response');

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
  });
});
