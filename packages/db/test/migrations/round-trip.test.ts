/**
 * Migration round trip (`packages/db/AGENTS.md` Definition of Done).
 *
 * The committed forward migration must build the whole schema from nothing, and the reviewed down
 * path must remove exactly what it built, leaving the database ready for the same migration again.
 * The test also proves the two constraints the issue names — the audit log refuses mutation and the
 * decision chain indexes exist — against a real PostgreSQL 16 server rather than by reading SQL.
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import {
  createAuditEvent,
  createDecision,
  createMember,
  createStaffUser,
  createSubmission,
  createWard,
} from '../../src/testing/factories.ts';
import {
  MIGRATIONS_FOLDER,
  createTestDatabase,
  readDownMigration,
  readMigration,
} from '../../src/testing/index.ts';

/** The second migration: the staff credential and the nullable member identifiers. */
const CREDENTIAL_MIGRATION = '0001_staff_credential_and_nullable_member_identifiers';

/** The third migration: the durable outbound notification queue (`C-076`). */
const QUEUE_MIGRATION = '0002_outbound_notification_queue';

describe('initial migration', () => {
  it('builds every table, then drops them all through the down path and builds again', async () => {
    const database = await createTestDatabase();
    try {
      const tablesBefore = await database.pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' order by tablename",
      );
      expect(tablesBefore.rows.map((row) => row.tablename)).toContain('ward');
      expect(tablesBefore.rows).toHaveLength(34);

      const downCredential = await readDownMigration(CREDENTIAL_MIGRATION);
      await database.pool.query(downCredential);

      // Each down path must run before the one it built on: the outbound queue is dropped first, then
      // the credential, then the initial schema.
      const downQueue = await readDownMigration(QUEUE_MIGRATION);
      await database.pool.query(downQueue);

      const down = await readDownMigration('0000_initial');
      await database.pool.query(down);

      const tablesAfter = await database.pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public'",
      );
      expect(tablesAfter.rows).toHaveLength(0);

      const remainingTypes = await database.pool.query<{ typname: string }>(
        `select typname from pg_type t
           join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public' and t.typtype = 'e'`,
      );
      expect(remainingTypes.rows).toHaveLength(0);

      await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER });

      const tablesRebuilt = await database.pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public'",
      );
      expect(tablesRebuilt.rows).toHaveLength(34);
    } finally {
      await database.dispose();
    }
  });

  it('declares the indexes each named read path depends on', async () => {
    const database = await createTestDatabase();
    try {
      const indexes = await database.pool.query<{ indexname: string }>(
        "select indexname from pg_indexes where schemaname = 'public'",
      );
      const names = new Set(indexes.rows.map((row) => row.indexname));

      for (const name of [
        // FEAT-007 / C-083: the twenty-one-day overdue sweep and the decision queue.
        'submission_queue_idx',
        // C-038 / NFR-009: the full-text query.
        'search_document_document_idx',
        // C-024: the commitment register filtered by status and target date.
        'commitment_target_idx',
        // C-026: a ward's figures for a quarter.
        'ward_report_snapshot_card_ward_key',
        // ADR-002: the two partial unique indexes of the decision chain.
        'decision_root_key',
        'decision_successor_key',
        // C-017: one active backing per member and submission.
        'backing_active_member_key',
      ]) {
        expect(names, `missing index ${name}`).toContain(name);
      }
    } finally {
      await database.dispose();
    }
  });

  it('refuses an update or a delete against the audit log in the database', async () => {
    const database = await createTestDatabase();
    try {
      const staffId = await createStaffUser(database.db);
      const auditId = await createAuditEvent(database.db, { actorId: staffId });

      await expect(
        database.pool.query('update audit_event set reason = $1 where id = $2', [
          'rewritten',
          auditId,
        ]),
      ).rejects.toMatchObject({ code: '23001' });

      await expect(
        database.pool.query('delete from audit_event where id = $1', [auditId]),
      ).rejects.toMatchObject({ code: '23001' });

      const stillThere = await database.pool.query('select 1 from audit_event where id = $1', [
        auditId,
      ]);
      expect(stillThere.rowCount).toBe(1);
    } finally {
      await database.dispose();
    }
  });

  it('enforces the decision chain constraints from ADR-002', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const staffId = await createStaffUser(database.db);
      const submissionId = await createSubmission(database.db, { authorId: memberId, wardId });

      const root = await createDecision(database.db, { submissionId, signatoryId: staffId });

      // A second root for the same submission is refused.
      await expect(
        createDecision(database.db, { submissionId, signatoryId: staffId }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });

      const revision = await createDecision(database.db, {
        submissionId,
        signatoryId: staffId,
        version: 2,
        supersedesDecisionId: root,
      });

      // A branch from the same superseded decision is refused: the chain is linear.
      await expect(
        createDecision(database.db, {
          submissionId,
          signatoryId: staffId,
          version: 2,
          supersedesDecisionId: root,
        }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });

      // Superseding the new tip is the one allowed next revision.
      await expect(
        createDecision(database.db, {
          submissionId,
          signatoryId: staffId,
          version: 3,
          supersedesDecisionId: revision,
        }),
      ).resolves.toBeTypeOf('string');
    } finally {
      await database.dispose();
    }
  });
});

describe('staff credential migration', () => {
  it('adds the credential table and nullable identifiers, and reverses both', async () => {
    const database = await createTestDatabase();
    try {
      const staffId = await createStaffUser(database.db);
      const memberId = await createMember(database.db, { telephoneNumber: '+2348031234567' });

      // A deleted account, in the state the forward migration makes possible: identifiers nulled, row
      // and public author reference kept.
      await database.pool.query(
        `update member set telephone_number = null, full_name = null, declared_age = null,
                          deleted_at = '2026-03-01T09:00:00Z'
          where id = $1`,
        [memberId],
      );

      await database.pool.query(
        `insert into staff_credential
           (id, staff_user_id, username, password_hash, recovery_codes, failed_attempt_count, created_at)
         values ($1, $2, 'a.balogun', '$argon2id$v=19$m=19456,t=12,p=1$c2FsdA$aGFzaA', '[]'::jsonb, 0, now())`,
        ['scd_01J9Z4C8D1E2F3G4H5J6K7M8NP', staffId],
      );

      const down = await readDownMigration(CREDENTIAL_MIGRATION);
      await database.pool.query(down);

      const afterDown = await database.pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' and tablename = 'staff_credential'",
      );
      expect(afterDown.rows).toHaveLength(0);

      // The rollback restores the pre-migration representation rather than failing on the nulled row,
      // and the row itself survives.
      const restored = await database.pool.query<{
        telephone_number: string;
        full_name: string;
        declared_age: number;
      }>('select telephone_number, full_name, declared_age from member where id = $1', [memberId]);
      expect(restored.rows[0]).toEqual({
        telephone_number: '+2340000000000',
        full_name: 'Deleted member',
        declared_age: 18,
      });

      const forward = await readMigration(CREDENTIAL_MIGRATION);
      await database.pool.query(forward);

      const rebuilt = await database.pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' and tablename = 'staff_credential'",
      );
      expect(rebuilt.rows).toHaveLength(1);

      const nullable = await database.pool.query<{ column_name: string; is_nullable: string }>(
        `select column_name, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'member'
            and column_name in ('telephone_number', 'full_name', 'declared_age')
          order by column_name`,
      );
      expect(nullable.rows.map((row) => row.is_nullable)).toEqual(['YES', 'YES', 'YES']);
    } finally {
      await database.dispose();
    }
  });
});
