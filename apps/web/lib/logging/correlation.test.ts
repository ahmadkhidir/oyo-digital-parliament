/**
 * Correlation identifier tests (`C-001`, `C-091`).
 */
import { describe, expect, it } from 'vitest';
import {
  correlationIdFrom,
  newCorrelationId,
  readCorrelationId,
  CORRELATION_ID_PATTERN,
} from './correlation';

describe('correlation identifiers (C-001)', () => {
  it('mints values the contract pattern accepts', () => {
    const first = newCorrelationId();
    const second = newCorrelationId();
    expect(first).toMatch(CORRELATION_ID_PATTERN);
    expect(second).toMatch(CORRELATION_ID_PATTERN);
    expect(first).not.toBe(second);
  });

  it('accepts a valid X-Correlation-Id unchanged', () => {
    const reading = readCorrelationId(new Headers({ 'x-correlation-id': 'req_01J9Z6M2V4' }));
    expect(reading).toEqual({ ok: true, correlationId: 'req_01J9Z6M2V4' });
  });

  it('mints one when the header is absent', () => {
    const reading = readCorrelationId(new Headers());
    expect(reading.ok).toBe(true);
    expect(reading.correlationId).toMatch(CORRELATION_ID_PATTERN);
  });

  it('refuses a malformed header and labels the refusal with a fresh identifier', () => {
    const reading = readCorrelationId(new Headers({ 'x-correlation-id': 'not-a-correlation-id' }));
    expect(reading.ok).toBe(false);
    // The refused value is never echoed or reused: the refusal carries a minted one so its own log
    // line is still traceable.
    expect(reading.correlationId).not.toBe('not-a-correlation-id');
    expect(reading.correlationId).toMatch(CORRELATION_ID_PATTERN);
  });

  it('refuses values that only resemble the form', () => {
    for (const supplied of ['REQ_ABCDE', 'req_abcd', 'req_ABC', 'req_0123456789ABCDEFGHIJKLMNOPQRSTUVW']) {
      expect(readCorrelationId(new Headers({ 'x-correlation-id': supplied })).ok).toBe(false);
    }
  });
});

describe('tolerant correlation reading for the operational path (C-091)', () => {
  it('replaces a malformed header rather than failing the request', () => {
    const value = correlationIdFrom(new Headers({ 'x-correlation-id': 'not-a-correlation-id' }));
    expect(value).not.toBe('not-a-correlation-id');
    expect(value).toMatch(CORRELATION_ID_PATTERN);
  });
});
