/**
 * The transaction boundary (`packages/db/AGENTS.md` Discipline).
 *
 * A write that spans aggregates composes repositories inside one `withTransaction` call; no
 * repository opens a nested transaction. These tests prove the helper commits, rolls back and refuses
 * to nest, against a disposable database.
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withTransaction } from '../../src/client.ts';
import { ward } from '../../src/schema/ward.ts';
import { createTestDatabase, createWard } from '../../src/testing/index.ts';

describe('withTransaction', () => {
  it('commits every statement in the scope together', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await withTransaction(async (scope) => {
        const id = 'wrd_TX0001';
        await scope.tx.insert(ward).values({
          id,
          name: 'Transaction Ward',
          localGovernmentArea: 'Ibadan North',
          aliases: null,
          source: 'seeded',
          createdAt: '2026-01-05T09:00:00Z',
        });
        return id;
      }, database.db);

      const rows = await database.db.select().from(ward).where(eq(ward.id, wardId));
      expect(rows).toHaveLength(1);
    } finally {
      await database.dispose();
    }
  });

  it('rolls everything back when the work throws', async () => {
    const database = await createTestDatabase();
    try {
      await expect(
        withTransaction(async (scope) => {
          await createWard(scope.tx, { name: 'Rolled Back' });
          throw new Error('audit append failed');
        }, database.db),
      ).rejects.toThrow('audit append failed');

      const rows = await database.db.select().from(ward);
      expect(rows).toHaveLength(0);
    } finally {
      await database.dispose();
    }
  });

  it('refuses a nested transaction instead of opening a savepoint', async () => {
    const database = await createTestDatabase();
    try {
      await expect(
        withTransaction(async () => {
          await withTransaction(async () => undefined, database.db);
        }, database.db),
      ).rejects.toThrow('withTransaction was called inside an open transaction');
    } finally {
      await database.dispose();
    }
  });
});
