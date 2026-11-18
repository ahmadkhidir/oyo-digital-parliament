/**
 * The member and submission side of a ward resolution (`C-011`, `C-056`, `C-057`).
 *
 * Proves the ward is written on the member, the identity state moves, and that a resolution moves only
 * unresolved in-state submissions while leaving every word of their text alone.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createWardResolutionRepository } from './ward-resolution.repository.ts';
import { backing } from '../schema/backing.ts';
import { submission } from '../schema/submission.ts';
import {
  T0,
  createMember,
  createSubmission,
  createTestDatabase,
  createWard,
  testId,
} from '../testing/index.ts';

describe('ward resolution repository', () => {
  it('reads and writes the member’s ward and identity state', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db, { name: 'Ward IV, Agbowo' });
      const memberId = await createMember(database.db);
      const repository = createWardResolutionRepository(database.db);

      expect(await repository.get(memberId)).toMatchObject({
        id: memberId,
        wardStatus: 'unresolved',
        identityState: 'registered',
      });

      await repository.recordWard(memberId, wardId);
      expect(await repository.get(memberId)).toMatchObject({
        wardId,
        wardStatus: 'resolved',
      });

      await repository.setIdentityState(memberId, 'checked');
      expect((await repository.get(memberId))?.identityState).toBe('checked');
      expect(await repository.get('mbr_UNKNOWN1')).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('moves only unresolved in-state submissions and never rewrites their text', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db, { name: 'Ward IV, Agbowo' });
      const memberId = await createMember(database.db);

      const unresolved = await createSubmission(database.db, { authorId: memberId });
      const placed = await createSubmission(database.db, { authorId: memberId, wardId });
      const outOfArea = await createSubmission(database.db, { authorId: memberId });
      await database.db
        .update(submission)
        .set({ locationScope: 'out_of_state', status: 'out_of_area' })
        .where(eq(submission.id, outOfArea));

      const before = await database.pool.query<{ body: string; location_text: string }>(
        'select body, location_text from submission where id = $1',
        [unresolved],
      );

      const repository = createWardResolutionRepository(database.db);
      const candidates = await repository.listUnresolvedByAuthor(memberId);
      expect(candidates.map((row) => row.id).sort()).toEqual([unresolved, outOfArea].sort());
      expect(await repository.countWithWardByAuthor(memberId)).toBe(1);

      const moved = await repository.assignWard([unresolved, placed, outOfArea], wardId);
      expect(moved).toHaveLength(1);

      const after = await database.pool.query<{
        body: string;
        location_text: string;
        ward_id: string | null;
        ward_status: string;
      }>('select body, location_text, ward_id, ward_status from submission where id = $1', [
        unresolved,
      ]);
      expect(after.rows[0]?.body).toBe(before.rows[0]?.body);
      expect(after.rows[0]?.location_text).toBe(before.rows[0]?.location_text);
      expect(after.rows[0]?.ward_status).toBe('resolved');
      expect(after.rows[0]?.ward_id).toBe(wardId);
      expect(await repository.countWithWardByAuthor(memberId)).toBe(2);

      const stillOut = await repository.listUnresolvedByAuthor(memberId);
      expect(stillOut.map((row) => row.id)).toEqual([outOfArea]);
    } finally {
      await database.dispose();
    }
  });

  it('counts only active backings for the residence review figure', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db, { name: 'Ward IV, Agbowo' });
      const memberId = await createMember(database.db, { wardId });
      const submissionId = await createSubmission(database.db, { authorId: memberId, wardId });

      await database.db.insert(backing).values([
        {
          id: testId('bkg'),
          submissionId,
          memberId,
          identityStateAtBacking: 'registered',
          wardIdAtBacking: wardId,
          state: 'active',
          createdAt: T0,
        },
        {
          id: testId('bkg'),
          submissionId,
          memberId,
          identityStateAtBacking: 'registered',
          wardIdAtBacking: wardId,
          state: 'withdrawn',
          createdAt: T0,
        },
      ]);

      const repository = createWardResolutionRepository(database.db);
      expect(await repository.countByMember(memberId)).toBe(1);
      expect(await repository.countByMember('mbr_UNKNOWN1')).toBe(0);
    } finally {
      await database.dispose();
    }
  });
});
