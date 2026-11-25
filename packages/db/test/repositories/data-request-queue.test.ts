/**
 * The operator's data-request queue read (`C-066`, `C-067`, `screens/22-data-request-queue.md`).
 *
 * The queue is the operator's whole surface for rights requests: it lists the open requests in
 * statutory-deadline order and counts them. This suite covers the two read paths the screen composes —
 * `listQueue` and `listOpen` — against a disposable PostgreSQL 16 database, because the ordering
 * expression is SQL and a smoke test of the screen cannot prove it.
 *
 * The deadline is derived from the request's type, not from the order the rows were written, so the
 * fixture is deliberately written in an order that contradicts its deadline order: a suite that only
 * checked "rows come back" would pass against an `ORDER BY requested_at` and would not have caught the
 * interval error this file guards (`C-066`).
 */
import { describe, expect, it } from 'vitest';
import { dataRequestDueAt } from '@odp/domain';
import { createDataRequestRepository } from '../../src/repositories/data-request.repository.ts';
import { dataRequest } from '../../src/schema/data-request.ts';
import { createMember, createTestDatabase, testId } from '../../src/testing/index.ts';

/** The instant the queue is read at, fixed so the overdue count is reproducible. */
const NOW = '2026-11-25T09:00:00Z';

describe('data request queue', () => {
  it('returns nothing for an empty queue', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createDataRequestRepository(database.db);

      expect(await repository.listQueue({ status: 'open', limit: 10 })).toEqual({
        requests: [],
        nextCursor: null,
      });
      expect(await repository.listOpen()).toEqual([]);
    } finally {
      await database.dispose();
    }
  });

  it('lists the open requests and counts them, in deadline order', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      // Written oldest-deadline last: the ids below are insertion order, not deadline order.
      const exportId = testId('drq');
      const deletionId = testId('drq');
      const correctionId = testId('drq');
      const accessId = testId('drq');
      const closedExportId = testId('drq');
      const refusedAccessId = testId('drq');
      await database.db.insert(dataRequest).values([
        {
          id: exportId,
          memberId,
          type: 'export',
          status: 'received',
          requestedAt: '2026-11-01T09:00:00Z',
        },
        {
          id: deletionId,
          memberId,
          type: 'deletion',
          status: 'in_progress',
          requestedAt: '2026-11-10T09:00:00Z',
        },
        {
          // A deferred request stays in the queue: its hold is reviewed on a date (`C-067`).
          id: correctionId,
          memberId,
          type: 'correction',
          status: 'deferred_for_legal_hold',
          legalHoldNote: 'Held for legal review, reference ODP-004821.',
          legalHoldReviewAt: '2026-12-19T09:00:00Z',
          requestedAt: '2026-11-15T09:00:00Z',
        },
        {
          id: accessId,
          memberId,
          type: 'access',
          status: 'received',
          requestedAt: '2026-11-20T09:00:00Z',
        },
        // Closed requests are not in the queue, however early their deadline would be.
        {
          id: closedExportId,
          memberId,
          type: 'export',
          status: 'completed',
          requestedAt: '2026-11-02T09:00:00Z',
          completedAt: '2026-11-03T09:00:00Z',
        },
        {
          id: refusedAccessId,
          memberId,
          type: 'access',
          status: 'refused',
          outcomeReason: 'The request repeats one already answered on 2026-11-01.',
          requestedAt: '2026-11-03T09:00:00Z',
        },
      ]);

      const repository = createDataRequestRepository(database.db);

      // access is due 2026-11-27, export 2026-12-01, deletion 2026-12-10 and correction 2026-11-22:
      // the deadline order is correction, access, export, deletion (`C-066`).
      const deadlineOrder = [correctionId, accessId, exportId, deletionId];

      const queue = await repository.listQueue({ status: 'open', limit: 10 });
      expect(queue.requests.map((request) => request.id)).toEqual(deadlineOrder);
      expect(queue.nextCursor).toBeNull();
      expect(queue.requests[0]).toMatchObject({
        type: 'correction',
        status: 'deferred_for_legal_hold',
      });

      const open = await repository.listOpen();
      expect(open.map((request) => request.id)).toEqual(deadlineOrder);

      // The queue order is the domain's own deadline order, not a second copy of the rule.
      const dueDates = open.map((request) => dataRequestDueAt(request.type, request.requestedAt));
      expect(dueDates).toEqual([...dueDates].sort());

      // The overdue count is derived from the rows `listOpen` returns (`C-066`): only the correction
      // request is past its statutory deadline at NOW.
      const overdue = open.filter(
        (request) => Date.parse(dataRequestDueAt(request.type, request.requestedAt)) < Date.parse(NOW),
      );
      expect(overdue.map((request) => request.id)).toEqual([correctionId]);
    } finally {
      await database.dispose();
    }
  });

  it('pages the queue by cursor without losing the deadline order', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const exportId = testId('drq');
      const deletionId = testId('drq');
      const accessId = testId('drq');
      await database.db.insert(dataRequest).values([
        {
          id: exportId,
          memberId,
          type: 'export',
          status: 'received',
          requestedAt: '2026-11-01T09:00:00Z',
        },
        {
          id: deletionId,
          memberId,
          type: 'deletion',
          status: 'received',
          requestedAt: '2026-11-10T09:00:00Z',
        },
        {
          id: accessId,
          memberId,
          type: 'access',
          status: 'received',
          requestedAt: '2026-11-20T09:00:00Z',
        },
      ]);

      const repository = createDataRequestRepository(database.db);

      // Deadlines: access 2026-11-27, export 2026-12-01, deletion 2026-12-10.
      const first = await repository.listQueue({ status: 'open', limit: 2 });
      expect(first.requests.map((request) => request.id)).toEqual([accessId, exportId]);
      const cursor = first.nextCursor;
      expect(cursor).not.toBeNull();

      const second = await repository.listQueue({
        status: 'open',
        limit: 2,
        ...(cursor === null ? {} : { cursor }),
      });
      expect(second.requests.map((request) => request.id)).toEqual([deletionId]);
      expect(second.nextCursor).toBeNull();

      // The counts behind the screen come from the whole open set, not from the page (`C-066`).
      expect((await repository.listOpen()).map((request) => request.id)).toEqual([
        accessId,
        exportId,
        deletionId,
      ]);
    } finally {
      await database.dispose();
    }
  });
});
