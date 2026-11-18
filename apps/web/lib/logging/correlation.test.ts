/**
 * Correlation identifier tests (`C-001`, `C-091`).
 */
import { describe, expect, it } from 'vitest';
import { CORRELATION_ID_PATTERN, correlationIdFrom, newCorrelationId } from './correlation';

describe('correlation identifiers', () => {
  it('mints values the contract pattern accepts', () => {
    const first = newCorrelationId();
    const second = newCorrelationId();
    expect(first).toMatch(CORRELATION_ID_PATTERN);
    expect(second).toMatch(CORRELATION_ID_PATTERN);
    expect(first).not.toBe(second);
  });

  it('echoes a valid X-Correlation-Id unchanged', () => {
    const headers = new Headers({ 'x-correlation-id': 'req_01J9Z6M2V4' });
    expect(correlationIdFrom(headers)).toBe('req_01J9Z6M2V4');
  });

  it('replaces a malformed X-Correlation-Id rather than failing the request', () => {
    const headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });
    const value = correlationIdFrom(headers);
    expect(value).toMatch(CORRELATION_ID_PATTERN);
    expect(value).not.toBe('not-a-correlation-id');
  });

  it('mints one when the header is absent', () => {
    expect(correlationIdFrom(new Headers())).toMatch(CORRELATION_ID_PATTERN);
  });
});
