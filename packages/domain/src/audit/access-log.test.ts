/**
 * Reading the access log (`C-090`, `analytics.md` Access): the reviewer sees who read and when, and
 * never the reason or the target.
 */
import { describe, expect, it } from 'vitest';

import { ACCESS_LOG_MAX_LIMIT, readAuditAccessLog } from './access-log.ts';
import type { AuditAccessLogEntry } from './entities.ts';
import type { AuditAccessLogPort } from './ports.ts';

const ENTRY: AuditAccessLogEntry = {
  auditEventId: 'aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA',
  actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
  actorRole: 'operator',
  action: 'member_data.export',
  occurredAt: '2026-11-25T12:00:00Z',
};

/** A port that returns one entry and records the query it received. */
function fakeAccessLog(options: { throws?: boolean; nextCursor?: string | null } = {}) {
  const queries: Array<{ since?: string; limit: number }> = [];
  const port: AuditAccessLogPort = {
    async read(query) {
      if (options.throws === true) throw new Error('log unavailable');
      queries.push(query);
      return { entries: [ENTRY], nextCursor: options.nextCursor ?? null };
    },
  };
  return { port, queries };
}

describe('audit access log', () => {
  it('returns the projection with no reason and no target', async () => {
    const { port } = fakeAccessLog();
    const result = await readAuditAccessLog({ accessLog: port });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries).toEqual([ENTRY]);
    expect(Object.keys(result.entries[0] ?? {}).sort()).toEqual(
      ['action', 'actorId', 'actorRole', 'auditEventId', 'occurredAt'].sort(),
    );
    expect(result.nextCursor).toBeNull();
  });

  it('asks for twenty entries by default and passes the time bound through', async () => {
    const { port, queries } = fakeAccessLog();
    await readAuditAccessLog({ accessLog: port }, { since: '2026-11-01T00:00:00Z' });
    expect(queries).toEqual([{ limit: 20, since: '2026-11-01T00:00:00Z' }]);
  });

  it('passes a cursor on rather than paging in memory', async () => {
    const { port } = fakeAccessLog({ nextCursor: 'aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZB' });
    const result = await readAuditAccessLog({ accessLog: port }, { limit: 5 });
    expect(result.ok && result.nextCursor).toBe('aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZB');
  });

  it('refuses a page size outside the C-001 bounds', async () => {
    const { port, queries } = fakeAccessLog();
    for (const limit of [0, -1, ACCESS_LOG_MAX_LIMIT + 1, 2.5]) {
      const result = await readAuditAccessLog({ accessLog: port }, { limit });
      expect(result.ok, String(limit)).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_FAILED');
        expect(result.cause).toBe('ACCESS_LOG_LIMIT_OUT_OF_BAND');
      }
    }
    expect(queries).toHaveLength(0);
  });

  it('reports an unreadable log rather than an empty page', async () => {
    const { port } = fakeAccessLog({ throws: true });
    const result = await readAuditAccessLog({ accessLog: port });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('SERVICE_DEGRADED');
      expect(result.cause).toBe('ACCESS_LOG_UNAVAILABLE');
    }
  });
});
