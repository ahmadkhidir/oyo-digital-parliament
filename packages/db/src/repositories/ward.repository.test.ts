/**
 * The ward reference repository (`C-009`, `C-071`).
 *
 * Proves the list filter and paging, the whole-list read the matcher uses, and the alias accumulation
 * that must not add the same wording twice.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createWardRepository } from './ward.repository.ts';
import { ward } from '../schema/ward.ts';
import { createTestDatabase, createWard } from '../testing/index.ts';

describe('ward repository', () => {
  it('lists by local government area in (area, name, id) order with a page cursor', async () => {
    const database = await createTestDatabase();
    try {
      const first = await createWard(database.db, {
        name: 'Ward I, Ilora',
        localGovernmentArea: 'Afijio',
        createdAt: '2026-01-01T00:00:00Z',
      });
      const second = await createWard(database.db, {
        name: 'Ward II, Ilora',
        localGovernmentArea: 'Afijio',
        createdAt: '2026-01-01T00:00:00Z',
      });
      await createWard(database.db, {
        name: 'Ward IV, Agbowo',
        localGovernmentArea: 'Ibadan North',
        createdAt: '2026-01-01T00:00:00Z',
      });

      const repository = createWardRepository(database.db);
      const page = await repository.list({ localGovernmentArea: 'Afijio', limit: 1 });
      expect(page.wards.map((row) => row.id)).toEqual([first]);
      expect(page.nextCursor).not.toBeNull();

      const next = await repository.list({
        localGovernmentArea: 'Afijio',
        limit: 1,
        ...(page.nextCursor === null ? {} : { cursor: page.nextCursor }),
      });
      expect(next.wards.map((row) => row.id)).toEqual([second]);
      expect(next.nextCursor).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('reads one ward, the whole reference, and the wards of given areas', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db, { name: 'Ward IV, Agbowo' });
      const other = await createWard(database.db, {
        name: 'Ward I, Awe',
        localGovernmentArea: 'Afijio',
      });
      const repository = createWardRepository(database.db);

      expect((await repository.getById(wardId))?.name).toBe('Ward IV, Agbowo');
      expect(await repository.getById('wrd_UNKNOWN1')).toBeNull();
      expect((await repository.listForMatching()).map((row) => row.id).sort()).toEqual(
        [wardId, other].sort(),
      );
      expect(
        (await repository.listByLocalGovernmentAreas(['Ibadan North'])).map((row) => row.id),
      ).toEqual([wardId]);
      expect(await repository.listByLocalGovernmentAreas([])).toEqual([]);
    } finally {
      await database.dispose();
    }
  });

  it('appends the resident’s wording once, ignoring a case-only repeat', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db, { name: 'Ward IV, Agbowo' });
      const repository = createWardRepository(database.db);

      await repository.appendAlias({ wardId, alias: 'Behind Agbowo market' });
      await repository.appendAlias({ wardId, alias: 'behind agbowo market' });
      await repository.appendAlias({ wardId, alias: 'Agbowo Express' });

      const rows = await database.db.select().from(ward).where(eq(ward.id, wardId));
      expect(rows[0]?.aliases).toEqual(['Behind Agbowo market', 'Agbowo Express']);
    } finally {
      await database.dispose();
    }
  });
});
