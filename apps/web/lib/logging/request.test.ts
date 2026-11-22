/**
 * Request logging tests (`C-001`, `C-091`).
 */
import { describe, expect, it } from 'vitest';
import { CORRELATION_ID_PATTERN } from './correlation';
import { createJsonLogger } from './logger';
import { forRequest } from './request';

function memoryLines(): string[] {
  const lines: string[] = [];
  return lines;
}

describe('forRequest', () => {
  it('attaches the caller correlation identifier to every line and records the path without its query', () => {
    const lines = memoryLines();
    const logger = createJsonLogger({
      service: 'web',
      sink: { write: (line) => lines.push(line) },
    });

    const request = new Request('http://local/readyz?member=08031234567', {
      headers: { 'x-correlation-id': 'req_01J9Z6M2V4' },
    });
    const { correlationId, log } = forRequest(request, logger);
    log.info('probe.readiness', { status: 'not_ready' });

    expect(correlationId).toBe('req_01J9Z6M2V4');
    const record = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(record['correlationId']).toBe('req_01J9Z6M2V4');
    expect(record['context']).toEqual({
      method: 'GET',
      path: '/readyz',
      status: 'not_ready',
    });
    expect(lines[0]).not.toContain('08031234567');
  });

  it('mints a correlation identifier when the caller supplies none', () => {
    const logger = createJsonLogger({ service: 'web', sink: { write: () => undefined } });
    const { correlationId } = forRequest(new Request('http://local/healthz'), logger);
    expect(correlationId).toMatch(CORRELATION_ID_PATTERN);
  });

  it('never fails on a malformed header, so a probe cannot be made to fail on its input (C-091)', () => {
    const lines = memoryLines();
    const logger = createJsonLogger({
      service: 'web',
      sink: { write: (line) => lines.push(line) },
    });

    const request = new Request('http://local/readyz', {
      headers: { 'x-correlation-id': 'not-a-correlation-id' },
    });
    const { correlationId, log } = forRequest(request, logger);
    log.info('probe.readiness', { status: 'ready' });

    expect(correlationId).not.toBe('not-a-correlation-id');
    expect(correlationId).toMatch(CORRELATION_ID_PATTERN);
    const record = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(record['correlationId']).toBe(correlationId);
  });
});
