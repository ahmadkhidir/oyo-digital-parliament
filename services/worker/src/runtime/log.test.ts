/**
 * Worker log tests (`services/worker/AGENTS.md` Discipline: "Observability carries counts, never
 * content"; `C-091`: a structured JSON log carries a correlation identifier and redacts personal data).
 */
import { describe, expect, it } from 'vitest';
import { createJsonLogger, newCorrelationId, REDACTED } from './log.ts';

function memorySink(): { lines: string[]; write: (line: string) => void } {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

describe('worker JSON logger', () => {
  it('writes one structured object with the worker service and correlation identifier', () => {
    const sink = memorySink();
    const logger = createJsonLogger({
      sink,
      clock: { now: () => new Date('2026-11-18T09:14:00.000Z') },
    });

    logger.child({ correlationId: 'req_01J9Z6M2V4' }).info('worker.started', { port: 3001 });

    expect(JSON.parse(sink.lines[0] ?? '')).toEqual({
      time: '2026-11-18T09:14:00.000Z',
      level: 'info',
      service: 'worker',
      event: 'worker.started',
      correlationId: 'req_01J9Z6M2V4',
      context: { port: 3001 },
    });
  });

  it('redacts a batch context that carries personal data', () => {
    const sink = memorySink();
    const logger = createJsonLogger({ sink });
    logger.warn('worker.batch.failed', {
      memberId: 'mbr_01J9Z6K4Q3W8R2T5Y7B1C0D9EF',
      note: 'call 0803 123 4567',
    });

    const line = sink.lines[0] ?? '';
    expect(line).not.toContain('mbr_01J9Z6K4Q3W8R2T5Y7B1C0D9EF');
    expect(line).not.toContain('0803 123 4567');
    expect(line).toContain(REDACTED);
  });

  it('mints a correlation identifier in the contract form', () => {
    expect(newCorrelationId()).toMatch(/^req_[0-9A-Z]{4,32}$/);
  });

  it('never throws when the sink fails', () => {
    const logger = createJsonLogger({
      sink: {
        write() {
          throw new Error('log store unavailable');
        },
      },
    });
    expect(() => logger.error('worker.batch.failed', { batchId: 'run_1' })).not.toThrow();
  });
});
