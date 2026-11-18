/**
 * The audit repository (`C-090`, `C-077`, `NFR-028`).
 *
 * Covers the append response shape, the access-log projection (no reason, no entity identifier), and
 * the rule that the correlation identifier is stored beside the entity and never read back on it.
 */
import { describe, expect, it } from 'vitest';
import {
  createAuditEventRepository,
  readAuditEventsForEntity,
} from '../../src/repositories/audit-event.repository.ts';
import {
  T0,
  createAuditEvent,
  createStaffUser,
  createTestDatabase,
  testId,
} from '../../src/testing/index.ts';

describe('audit event repository', () => {
  it('appends the record, returns its log position and keeps the correlation beside it', async () => {
    const database = await createTestDatabase();
    try {
      const staffId = await createStaffUser(database.db);
      const repository = createAuditEventRepository(database.db);
      const eventId = testId('aud');

      const first = await repository.append(
        {
          id: eventId,
          actorId: staffId,
          actorRole: 'response_staff',
          action: 'decision.published',
          entityType: 'Decision',
          entityId: testId('dec'),
          reason: 'Commit published against ODP-004821.',
          occurredAt: T0,
        },
        { correlationId: 'req_01J9Z6M2V4' },
      );
      expect(first.sequence).toBe(1);

      const second = await repository.append(
        {
          id: testId('aud'),
          actorId: staffId,
          actorRole: 'response_staff',
          action: 'decision.revised',
          entityType: 'Decision',
          entityId: testId('dec'),
          occurredAt: T0,
        },
        {},
      );
      expect(second.sequence).toBe(2);

      const rows = await database.pool.query<{
        correlation_id: string | null;
        reason: string | null;
      }>('select correlation_id, reason from audit_event where id = $1', [eventId]);
      expect(rows.rows[0]).toEqual({
        correlation_id: 'req_01J9Z6M2V4',
        reason: 'Commit published against ODP-004821.',
      });

      // The stored entity read carries neither infrastructure column as an event property.
      const events = await readAuditEventsForEntity(database.db, {
        entityType: 'Decision',
        entityId: (
          await database.pool.query<{ entity_id: string }>(
            'select entity_id from audit_event where id = $1',
            [eventId],
          )
        ).rows[0]?.entity_id as string,
        limit: 10,
      });
      expect(events).toHaveLength(1);
      expect(Object.keys(events[0] ?? {})).not.toContain('sequence');
      expect(Object.keys(events[0] ?? {})).not.toContain('correlationId');
    } finally {
      await database.dispose();
    }
  });

  it('projects only member-data reads, exports and refusals into the access log, without reason', async () => {
    const database = await createTestDatabase();
    try {
      const staffId = await createStaffUser(database.db);
      await createAuditEvent(database.db, {
        actorId: staffId,
        action: 'member_data.read',
        entityType: 'Member',
        entityId: testId('mbr'),
        reason: 'Access request ODR-0001.',
        occurredAt: '2026-01-05T09:00:00Z',
      });
      await createAuditEvent(database.db, {
        actorId: staffId,
        actorRole: 'operator',
        action: 'member_data.export',
        entityType: 'Member',
        entityId: testId('mbr'),
        occurredAt: '2026-01-05T09:01:00Z',
      });
      await createAuditEvent(database.db, {
        actorId: staffId,
        action: 'decision.published',
        entityType: 'Decision',
        entityId: testId('dec'),
        occurredAt: '2026-01-05T09:02:00Z',
      });

      const repository = createAuditEventRepository(database.db);
      const page = await repository.read({ limit: 20 });

      expect(page.entries).toHaveLength(2);
      expect(page.entries.map((entry) => entry.action).sort()).toEqual([
        'member_data.export',
        'member_data.read',
      ]);
      for (const entry of page.entries) {
        expect(Object.keys(entry)).toEqual([
          'auditEventId',
          'actorId',
          'actorRole',
          'action',
          'occurredAt',
        ]);
      }
      expect(page.nextCursor).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('pages the access log by log position and reports the next cursor', async () => {
    const database = await createTestDatabase();
    try {
      const staffId = await createStaffUser(database.db);
      const repository = createAuditEventRepository(database.db);

      for (let index = 0; index < 3; index += 1) {
        await repository.append(
          {
            id: testId('aud'),
            actorId: staffId,
            actorRole: 'operator',
            action: 'member_data.read',
            entityType: 'Member',
            entityId: testId('mbr'),
            occurredAt: T0,
          },
          {},
        );
      }

      const firstPage = await repository.read({ limit: 2 });
      expect(firstPage.entries).toHaveLength(2);
      expect(firstPage.nextCursor).toBe('2');

      // `since` is a lower time bound, and the page is newest first.
      const bounded = await repository.read({ limit: 20, since: '2026-01-06T00:00:00Z' });
      expect(bounded.entries).toHaveLength(0);
    } finally {
      await database.dispose();
    }
  });
});
