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
} from '../../src/testing/index.ts';

describe('initial migration', () => {
  it('builds every table, then drops them all through the down path and builds again', async () => {
    const database = await createTestDatabase();
    try {
      const tablesBefore = await database.pool.query<{ tablename: string }>(
        "select tablename from pg_tables where schemaname = 'public' order by tablename",
      );
      expect(tablesBefore.rows.map((row) => row.tablename)).toContain('ward');
      expect(tablesBefore.rows).toHaveLength(32);

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
      expect(tablesRebuilt.rows).toHaveLength(32);
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
