/**
 * The shared rate-limit signalling (`C-001`, `NFR-027`).
 *
 * One helper renders the three headers for every surface, so these tests pin the conversion, the
 * unmetered allowance and the wrapping rules that let a route handler, a refusal and a metered
 * answer all leave through the same seam.
 */
import { describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { RateLimitHeaders, RateLimitOutcome } from '@odp/domain';
import {
  RATE_LIMIT_HEADER_NAMES,
  actionMeta,
  actionRateLimit,
  actionRefusal,
  hasRateLimitHeaders,
  rateLimitHeaderValues,
  rateLimited,
  readActionRequest,
  readAllowance,
  signalOf,
  withRateLimitHeaders,
} from './rate-limit';

/** The headers a simulated action request presents; swapped per test. */
const requestHeaders = vi.hoisted(() => ({ value: new Headers() }));

vi.mock('next/headers', () => ({
  headers: async () => requestHeaders.value,
}));

/** One limiter answer, as the fixed-window adapter produces it. */
function outcome(overrides: Partial<RateLimitOutcome> = {}): RateLimitOutcome {
  return {
    allowed: false,
    retryAfterSeconds: 42,
    limit: 5,
    remaining: 0,
    resetAt: '2026-11-18T09:15:00Z',
    ...overrides,
  };
}

describe('readAllowance (C-001)', () => {
  it('reports the whole allowance and the end of the current window', () => {
    const allowance = readAllowance(new Date('2026-11-18T09:00:30Z'));

    expect(allowance.limit).toBe(120);
    expect(allowance.remaining).toBe(120);
    // The window is a whole minute; 09:00:30 falls in the window that resets at 09:01:00.
    expect(allowance.resetSeconds).toBe(Date.parse('2026-11-18T09:01:00Z') / 1000);
  });

  it('moves the reset forward with the window', () => {
    const first = readAllowance(new Date('2026-11-18T09:00:59Z'));
    const next = readAllowance(new Date('2026-11-18T09:01:00Z'));

    expect(next.resetSeconds - first.resetSeconds).toBe(60);
  });
});

describe('signalOf (C-001)', () => {
  it('reads the cap, the remainder and the reset off a limiter answer', () => {
    expect(signalOf(outcome())).toEqual({
      limit: 5,
      remaining: 0,
      resetSeconds: Date.parse('2026-11-18T09:15:00Z') / 1000,
      retryAfterSeconds: 42,
    });
  });

  it('reads the triple a refusal already carries, without a second consult', () => {
    const carried: RateLimitHeaders = { limit: 5, remaining: 1, resetSeconds: 1_763_457_300 };

    expect(signalOf({ rateLimit: carried })).toBe(carried);
  });

  it('answers null for a refusal raised by a rule of its own', () => {
    expect(signalOf({})).toBeNull();
  });
});

describe('rateLimitHeaderValues (C-001)', () => {
  it('prints the three header names C-001 fixes', () => {
    expect(rateLimitHeaderValues({ limit: 5, remaining: 2, resetSeconds: 1_763_457_300 })).toEqual({
      'RateLimit-Limit': '5',
      'RateLimit-Remaining': '2',
      'RateLimit-Reset': '1763457300',
    });
  });

  it('adds Retry-After to a refusal', () => {
    expect(
      rateLimitHeaderValues({
        limit: 5,
        remaining: 0,
        resetSeconds: 1_763_457_300,
        retryAfterSeconds: 42,
      }),
    ).toMatchObject({ 'Retry-After': '42' });
  });

  it('uses the names the domain records, so no call site spells one', () => {
    expect(RATE_LIMIT_HEADER_NAMES).toEqual({
      limit: 'RateLimit-Limit',
      remaining: 'RateLimit-Remaining',
      reset: 'RateLimit-Reset',
      retryAfter: 'Retry-After',
    });
  });
});

describe('withRateLimitHeaders (C-001)', () => {
  it('keeps the answer and adds the unmetered triple', async () => {
    const answer = Response.json(
      { ok: true },
      { status: 200, headers: { 'Cache-Control': 'no-store', 'X-Correlation-Id': 'req_TEST' } },
    );

    const printed = withRateLimitHeaders(answer, null, new Date('2026-11-18T09:00:30Z'));

    expect(printed.status).toBe(200);
    expect(printed.headers.get('cache-control')).toBe('no-store');
    expect(printed.headers.get('x-correlation-id')).toBe('req_TEST');
    expect(printed.headers.get(RATE_LIMIT_HEADER_NAMES.limit)).toBe('120');
    expect(printed.headers.get(RATE_LIMIT_HEADER_NAMES.remaining)).toBe('120');
    expect(printed.headers.get(RATE_LIMIT_HEADER_NAMES.reset)).toBe(
      String(Date.parse('2026-11-18T09:01:00Z') / 1000),
    );
    await expect(printed.json()).resolves.toEqual({ ok: true });
  });

  it('prints a refusal’s own triple instead of the allowance', () => {
    const refusal = Response.json({ error: { code: 'RATE_LIMITED' } }, { status: 429 });

    const printed = withRateLimitHeaders(refusal, signalOf(outcome()));

    expect(printed.status).toBe(429);
    expect(printed.headers.get(RATE_LIMIT_HEADER_NAMES.limit)).toBe('5');
    expect(printed.headers.get(RATE_LIMIT_HEADER_NAMES.remaining)).toBe('0');
    expect(printed.headers.get(RATE_LIMIT_HEADER_NAMES.reset)).toBe(
      String(Date.parse('2026-11-18T09:15:00Z') / 1000),
    );
    expect(printed.headers.get(RATE_LIMIT_HEADER_NAMES.retryAfter)).toBe('42');
  });

  it('leaves an answer that already carries a complete triple untouched', () => {
    const answer = Response.json(
      { ok: true },
      {
        headers: {
          'RateLimit-Limit': '5',
          'RateLimit-Remaining': '4',
          'RateLimit-Reset': '1763457300',
        },
      },
    );

    expect(withRateLimitHeaders(answer)).toBe(answer);
    expect(hasRateLimitHeaders(answer.headers)).toBe(true);
  });
});

describe('rateLimited (C-001)', () => {
  it('adds the triple to every answer a handler returns', async () => {
    const handler = rateLimited(async () =>
      Response.json({ ok: false }, { status: 400, headers: { 'X-Correlation-Id': 'req_TEST' } }),
    );

    const answer = await handler(new Request('http://local/api/example') as unknown as NextRequest);

    expect(answer.status).toBe(400);
    expect(answer.headers.get('x-correlation-id')).toBe('req_TEST');
    expect(hasRateLimitHeaders(answer.headers)).toBe(true);
    await expect(answer.json()).resolves.toEqual({ ok: false });
  });
});

describe('the action envelope (C-001 1.6.2)', () => {
  const AT = new Date('2026-11-18T09:00:30Z');
  const SIGNAL: RateLimitHeaders = {
    limit: 5,
    remaining: 3,
    resetSeconds: Date.parse('2026-11-18T09:15:00Z') / 1000,
  };

  it('names the reset instant in RFC 3339 form', () => {
    expect(actionRateLimit(SIGNAL)).toEqual({
      limit: 5,
      remaining: 3,
      resetAt: '2026-11-18T09:15:00Z',
    });
  });

  it('carries the correlation identifier, the instant and the triple on every answer', () => {
    expect(actionMeta('req_01J9Z6M2V4', SIGNAL, AT)).toEqual({
      correlationId: 'req_01J9Z6M2V4',
      asAt: '2026-11-18T09:00:30Z',
      rateLimit: { limit: 5, remaining: 3, resetAt: '2026-11-18T09:15:00Z' },
    });
  });

  it('refuses a malformed header through the action answer, triple included', async () => {
    requestHeaders.value = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    const request = await readActionRequest(AT);
    const refusal = actionRefusal(request.correlation, request.rateLimit, AT);

    expect(request.correlation.ok).toBe(false);
    expect(refusal).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        cause: 'CORRELATION_ID_INVALID',
        fields: { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
      },
      meta: {
        asAt: '2026-11-18T09:00:30Z',
        rateLimit: {
          limit: 120,
          remaining: 120,
          resetAt: '2026-11-18T09:01:00Z',
        },
      },
    });
    // The refused value is never echoed: the refusal is labelled with a minted identifier.
    expect(refusal?.error.correlationId).not.toBe('not-a-correlation-id');
    expect(refusal?.error.correlationId).toMatch(/^req_[0-9A-Z]{4,32}$/);
  });

  it('admits a valid header unchanged and builds no refusal', async () => {
    requestHeaders.value = new Headers({ 'x-correlation-id': 'req_01J9Z6M2V4' });

    const request = await readActionRequest(AT);

    expect(request.correlation).toEqual({ ok: true, correlationId: 'req_01J9Z6M2V4' });
    expect(actionRefusal(request.correlation, request.rateLimit, AT)).toBeNull();
    expect(actionMeta(request.correlation.correlationId, request.rateLimit, AT).rateLimit).toEqual({
      limit: 120,
      remaining: 120,
      resetAt: '2026-11-18T09:01:00Z',
    });
  });
});
