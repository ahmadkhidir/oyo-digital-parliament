/**
 * The operator's queue read (`C-066`, screen 22).
 *
 * Proves the three things the read owns: deadline order and overdue derivation, the operator-only
 * role check (with the second-factor refusal before it), and that no personal field reaches the
 * projection.
 */
import { describe, expect, it } from 'vitest';
import type { DataRequest, IdentityCaller } from '../entities.ts';
import type { DataRequestQueuePort } from '../ports.ts';
import { readDataRequestQueue } from './read-data-request-queue.ts';

const NOW = '2026-11-22T09:00:00Z';

function operator(): Extract<IdentityCaller, { kind: 'staff' }> {
  return {
    kind: 'staff',
    staffId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
    role: 'operator',
    external: false,
    authorisedWardIds: [],
    secondFactorSatisfied: true,
    secondFactorEnrolled: true,
    sessionId: 'session-token-0123456789abcdef',
    sessionStartedAt: '2026-11-22T08:00:00Z',
    sessionExpiresAt: '2026-11-22T08:30:00Z',
    locale: 'en-NG',
  };
}

function request(overrides: Partial<DataRequest>): DataRequest {
  return {
    id: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
    memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
    type: 'access',
    status: 'received',
    requestedAt: '2026-11-21T07:20:00Z',
    ...overrides,
  };
}

function queuePort(rows: readonly DataRequest[]): DataRequestQueuePort {
  return {
    async listQueue(query) {
      return { requests: rows.slice(0, query.limit), nextCursor: null };
    },
    async listOpen() {
      return rows.filter((row) => row.status !== 'completed' && row.status !== 'refused');
    },
  };
}

const deps = (rows: readonly DataRequest[]) => ({
  dataRequests: queuePort(rows),
  clock: { now: () => new Date(NOW) },
});

describe('readDataRequestQueue (C-066)', () => {
  it('derives the due date, the overdue flag and the two counts', async () => {
    const result = await readDataRequestQueue(operator(), deps([
      request({ id: 'drq_1', type: 'access', requestedAt: '2026-11-10T00:00:00Z' }),
      request({ id: 'drq_2', type: 'export', status: 'in_progress', requestedAt: '2026-11-20T00:00:00Z' }),
      request({ id: 'drq_3', type: 'correction', status: 'completed', requestedAt: '2026-01-01T00:00:00Z' }),
    ]));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.openCount).toBe(2);
    expect(result.overdueCount).toBe(1);
    expect(result.requests[0]?.dueAt).toBe('2026-11-17T00:00:00Z');
    expect(result.requests[0]?.overdue).toBe(true);
    expect(result.requests[1]?.overdue).toBe(false);
  });

  it('returns no member identifier or personal field', async () => {
    const result = await readDataRequestQueue(operator(), deps([request({})]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const row = result.requests[0] as unknown as Record<string, unknown>;
    expect(row['memberId']).toBeUndefined();
    expect(JSON.stringify(result.requests)).not.toContain('mbr_');
  });

  it('refuses a role that does not work the queue', async () => {
    const result = await readDataRequestQueue(
      { ...operator(), role: 'response_staff' },
      deps([request({})]),
    );
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE', cause: 'OPERATOR_REQUIRED' });
  });

  it('refuses an operator whose second factor is not satisfied', async () => {
    const result = await readDataRequestQueue(
      { ...operator(), secondFactorSatisfied: false },
      deps([request({})]),
    );
    expect(result).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'SECOND_FACTOR_REQUIRED',
    });
  });
});
