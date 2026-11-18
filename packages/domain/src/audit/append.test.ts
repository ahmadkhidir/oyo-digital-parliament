/**
 * The append use case (`C-090`, `NFR-028`): one record in, one log position out, and no path where a
 * failed append is treated as success.
 */
import { describe, expect, it } from 'vitest';

import { appendAuditEvent } from './append.ts';
import type { AuditEventRecord } from './entities.ts';

/** A store that records what it was asked to append. */
function fakeStore(options: { throws?: boolean; sequence?: number } = {}) {
  const appended: AuditEventRecord[] = [];
  const correlations: Array<{ correlationId?: string }> = [];
  const store = {
    appended,
    correlations,
    async append(event: AuditEventRecord, correlation: { correlationId?: string }) {
      if (options.throws === true) throw new Error('log unavailable');
      appended.push(event);
      correlations.push(correlation);
      return { sequence: options.sequence ?? 184223 };
    },
  };
  return store;
}

/** A deterministic id generator, so a test never depends on entropy. */
const ids = {
  calls: [] as string[],
  next(prefix: string) {
    ids.calls.push(prefix);
    return `${prefix}_01J9ZN2Q4R6S8T1V3W5X7Y9ZA`;
  },
};

const input = {
  actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
  actorRole: 'response_staff' as const,
  action: 'decision.published',
  entityType: 'Decision',
  entityId: 'dec_01J9ZB1C3D5E7F9G1H3J5K7LMP',
  reason: 'Commit published against ODP-004821.',
  occurredAt: '2026-11-25T12:00:00Z',
  correlationId: 'req_01J9Z6M2V4',
};

describe('audit append', () => {
  it('generates the record id and returns the log position', async () => {
    const store = fakeStore();
    const result = await appendAuditEvent({ store, identifiers: ids }, input);
    expect(result).toEqual({
      ok: true,
      id: 'aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA',
      appended: true,
      sequence: 184223,
      occurredAt: '2026-11-25T12:00:00Z',
    });
    expect(store.appended).toHaveLength(1);
    expect(store.appended[0]).toMatchObject({
      id: 'aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA',
      actorId: input.actorId,
      actorRole: 'response_staff',
      action: 'decision.published',
      entityType: 'Decision',
      entityId: input.entityId,
      reason: input.reason,
    });
    expect(store.correlations).toEqual([{ correlationId: 'req_01J9Z6M2V4' }]);
  });

  it('keeps a caller-supplied id rather than minting a second one', async () => {
    const store = fakeStore();
    const result = await appendAuditEvent(
      { store, identifiers: ids },
      { ...input, id: 'aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZB' },
    );
    expect(result.ok && result.id).toBe('aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZB');
  });

  it('refuses an invalid record without touching the log', async () => {
    const store = fakeStore();
    const result = await appendAuditEvent(
      { store, identifiers: ids },
      { ...input, actorRole: 'admin' as never },
    );
    expect(result.ok).toBe(false);
    expect(store.appended).toHaveLength(0);
  });

  it('fails the append, not just the log line, when the log refuses it', async () => {
    const store = fakeStore({ throws: true });
    const result = await appendAuditEvent({ store, identifiers: ids }, input);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('SERVICE_DEGRADED');
      expect(result.cause).toBe('AUDIT_APPEND_FAILED');
    }
  });

  it('offers no way to revise or remove a recorded entry', async () => {
    const audit = await import('./index.ts');
    const forbidden = Object.keys(audit).filter((name) =>
      /(update|delete|remove|edit|revise).*audit|audit.*(update|delete|remove|edit|revise)/i.test(
        name,
      ),
    );
    expect(forbidden).toEqual([]);
    const store = fakeStore();
    expect(Object.keys(store).sort()).toEqual(['appended', 'append', 'correlations'].sort());
    expect((store as unknown as Record<string, unknown>)['update']).toBeUndefined();
  });
});
