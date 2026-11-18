/**
 * The member repository (`schema.md` Member, `C-032`, `C-033`, `FEAT-001`, `FEAT-012`).
 *
 * Proves the account round-trip, the shared-handset rule (two accounts, never merged), the narrow
 * profile correction, deletion as a state change that keeps the public author reference, and the
 * absence of any ward-grouped operation or supporting index.
 */
import { describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createMemberRepository } from './member.repository.ts';
import { comment } from '../schema/comment.ts';
import { member } from '../schema/member.ts';
import {
  T0,
  createMember,
  createSubmission,
  createTestDatabase,
  createWard,
  testId,
} from '../testing/index.ts';

describe('member repository', () => {
  it('reads an account with and without a recorded ward, mapping absent fields to undefined', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createMemberRepository(database.db);
      const wardId = await createWard(database.db);
      const resolved = await createMember(database.db, { wardId, identityState: 'checked' });
      const unresolved = await createMember(database.db, { wardId: null });

      expect(await repository.get(resolved)).toMatchObject({
        id: resolved,
        wardId,
        wardStatus: 'resolved',
        identityState: 'checked',
        verificationMethod: 'self_code',
        sharedNumber: false,
      });
      const open = await repository.get(unresolved);
      expect(open?.wardStatus).toBe('unresolved');
      expect(open?.wardId).toBeUndefined();
      expect(open?.deletedAt).toBeUndefined();
      expect(await repository.get(testId('mbr'))).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('lists every live account on a shared number oldest first and never merges them', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createMemberRepository(database.db);
      const number = '+2348031234567';
      const first = await createMember(database.db, {
        telephoneNumber: number,
        displayName: 'Seun A.',
        createdAt: '2026-01-01T09:00:00Z',
      });
      const second = await createMember(database.db, {
        telephoneNumber: number,
        displayName: 'Bisi A.',
        createdAt: '2026-02-01T09:00:00Z',
      });
      const elsewhere = await createMember(database.db, { telephoneNumber: '+2348099999999' });

      expect((await repository.findByTelephone(number)).map((row) => row.id)).toEqual([
        first,
        second,
      ]);
      expect((await repository.findByTelephone('+2348000000000')).length).toBe(0);

      await repository.markSharedNumber(number);
      expect((await repository.get(first))?.sharedNumber).toBe(true);
      expect((await repository.get(second))?.sharedNumber).toBe(true);
      expect((await repository.get(elsewhere))?.sharedNumber).toBe(false);

      // An anonymised row is no longer a sign-in account on the handset.
      await repository.anonymise(first, '2026-03-01T09:00:00Z');
      expect((await repository.findByTelephone(number)).map((row) => row.id)).toEqual([second]);
    } finally {
      await database.dispose();
    }
  });

  it('rewrites the three profile fields and nothing else', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createMemberRepository(database.db);
      const id = await createMember(database.db, {
        telephoneNumber: '+2348031234567',
        fullName: 'Oluwaseun Adeyemi',
        displayName: 'Seun A.',
      });

      await repository.updateProfile(id, {
        displayName: 'Seun Adeyemi',
        fullName: 'Oluwaseun Adeyemi',
        locale: 'yo-NG',
      });

      expect(await repository.get(id)).toMatchObject({
        displayName: 'Seun Adeyemi',
        fullName: 'Oluwaseun Adeyemi',
        locale: 'yo-NG',
        telephoneNumber: '+2348031234567',
        declaredAge: 24,
        identityState: 'registered',
      });
    } finally {
      await database.dispose();
    }
  });

  it('refuses a display name another live member publishes, ignoring case', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createMemberRepository(database.db);
      const id = await createMember(database.db, { displayName: 'Seun A.' });
      const other = await createMember(database.db, { displayName: 'Bisi A.' });

      expect(await repository.isDisplayNameTaken('seun a.')).toBe(true);
      expect(await repository.isDisplayNameTaken('SEUN A.')).toBe(true);
      expect(await repository.isDisplayNameTaken('Seun A.', id)).toBe(false);
      expect(await repository.isDisplayNameTaken('Seun A.', other)).toBe(true);
      expect(await repository.isDisplayNameTaken('Tunde B.')).toBe(false);
    } finally {
      await database.dispose();
    }
  });

  it('anonymises the identifiers, keeps the row and the display name, and leaves authored content', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createMemberRepository(database.db);
      const wardId = await createWard(database.db);
      const id = await createMember(database.db, {
        wardId,
        telephoneNumber: '+2348031234567',
        fullName: 'Oluwaseun Adeyemi',
        displayName: 'Seun A.',
      });
      const submissionId = await createSubmission(database.db, { authorId: id, wardId });
      await database.db.insert(comment).values({
        id: testId('cmt'),
        submissionId,
        authorId: id,
        body: 'The queue at the next borehole is worse than this one.',
        status: 'published',
        routingFlag: null,
        createdAt: T0,
      });

      expect(await repository.countAuthoredContent(id)).toEqual({ submissions: 1, comments: 1 });

      await repository.anonymise(id, '2026-03-01T09:00:00Z');
      const anonymised = await repository.get(id);
      expect(anonymised).toMatchObject({
        id,
        telephoneNumber: '+2340000000000',
        fullName: 'Deleted member',
        declaredAge: 18,
        displayName: 'Seun A.',
        deletedAt: '2026-03-01T09:00:00Z',
      });

      // The stored row is what `schema.md` requires: the direct identifiers are null, not a
      // placeholder that could be mistaken for a real number, name or age. Only the projection carries
      // the reserved values, because the domain type has no null.
      const storedRows = await database.db
        .select({
          telephoneNumber: member.telephoneNumber,
          fullName: member.fullName,
          declaredAge: member.declaredAge,
        })
        .from(member)
        .where(eq(member.id, id));
      expect(storedRows[0]).toEqual({
        telephoneNumber: null,
        fullName: null,
        declaredAge: null,
      });

      // The public record keeps a non-identifying author reference: nothing is deleted.
      expect((await repository.countAuthoredContent(id)).submissions).toBe(1);
      const rows = await database.db
        .select({ authorId: member.id })
        .from(member)
        .where(eq(member.id, id));
      expect(rows[0]?.authorId).toBe(id);

      // A second call is a no-op: the first deletion is the recorded instant.
      await repository.anonymise(id, '2026-04-01T09:00:00Z');
      expect((await repository.get(id))?.deletedAt).toBe('2026-03-01T09:00:00Z');
    } finally {
      await database.dispose();
    }
  });

  it('has no operation that could produce a member register by ward', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createMemberRepository(database.db);
      // A caller cannot reach a ward-grouped read because no such member exists on the surface.
      expect(
        Object.keys(repository).filter((key) => /ward|register|group|local/i.test(key)),
      ).toEqual([]);

      // Nor is there an index that would serve one (`packages/db/src/schema/member.ts`).
      const indexes = await database.db.execute(
        sql`select indexdef from pg_indexes where schemaname = 'public' and tablename = 'member'`,
      );
      expect(indexes.rows.length).toBeGreaterThan(0);
      for (const row of indexes.rows) {
        expect(String(row['indexdef'])).not.toContain('ward_id');
      }
    } finally {
      await database.dispose();
    }
  });
});
