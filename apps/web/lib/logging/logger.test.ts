/**
 * Structured logger tests (`C-091`: a structured JSON log carries a request or correlation identifier
 * and redacts personal data).
 */
import { describe, expect, it } from 'vitest';
import { createJsonLogger, type LogLevel } from './logger';

function memorySink(): {
  lines: string[];
  levels: LogLevel[];
  write: (line: string, level: LogLevel) => void;
} {
  const lines: string[] = [];
  const levels: LogLevel[] = [];
  return {
    lines,
    levels,
    write(line, level) {
      lines.push(line);
      levels.push(level);
    },
  };
}

describe('JSON logger', () => {
  it('writes one JSON object with the service, event, time and level', () => {
    const sink = memorySink();
    const logger = createJsonLogger({
      service: 'web',
      sink,
      clock: { now: () => new Date('2026-11-18T09:14:00.000Z') },
    });

    logger.info('probe.liveness', { status: 'alive', attempt: 1 });

    expect(sink.lines).toHaveLength(1);
    expect(JSON.parse(sink.lines[0] ?? '')).toEqual({
      time: '2026-11-18T09:14:00.000Z',
      level: 'info',
      service: 'web',
      event: 'probe.liveness',
      context: { status: 'alive', attempt: 1 },
    });
    expect(sink.levels).toEqual(['info']);
  });

  it('hoists the correlation identifier a request logger supplies', () => {
    const sink = memorySink();
    const logger = createJsonLogger({ service: 'web', sink });
    logger.child({ correlationId: 'req_01J9Z6M2V4' }).info('probe.readiness', { status: 'ready' });

    const record = JSON.parse(sink.lines[0] ?? '') as Record<string, unknown>;
    expect(record['correlationId']).toBe('req_01J9Z6M2V4');
    expect(record['context']).toEqual({ status: 'ready' });
  });

  it('redacts personal data before the line reaches the sink', () => {
    const sink = memorySink();
    const logger = createJsonLogger({ service: 'web', sink });

    logger.warn('request.failed', {
      fullName: 'Aminat Okafor',
      telephoneNumber: '08031234567',
      detail: 'callback to 0803 123 4567',
    });

    const line = sink.lines[0] ?? '';
    expect(line).not.toContain('Aminat');
    expect(line).not.toContain('08031234567');
    expect(line).not.toContain('0803 123 4567');
    expect(line).toContain('[redacted]');
  });

  it('routes warnings and errors to the error stream', () => {
    const out: string[] = [];
    const err: string[] = [];
    const logger = createJsonLogger({
      service: 'web',
      sink: {
        write(line, level) {
          if (level === 'warn' || level === 'error') err.push(line);
          else out.push(line);
        },
      },
    });

    logger.info('probe.liveness');
    logger.error('probe.readiness');
    expect(out).toHaveLength(1);
    expect(err).toHaveLength(1);
  });

  it('never throws when the sink fails', () => {
    const logger = createJsonLogger({
      service: 'web',
      sink: {
        write() {
          throw new Error('log store unavailable');
        },
      },
    });
    expect(() => logger.error('request.failed', { attempt: 1 })).not.toThrow();
  });
});
