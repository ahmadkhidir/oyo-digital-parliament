/**
 * The residence review repository (`C-055`, `C-057`).
 *
 * One row per review, appended with the reviewer, the method and the decision; the note is stored
 * privately and read back only for the reviewer. The queue read lists the members whose ward is
 * recorded and whose residence is not yet accepted, oldest registration first, with the display
 * name and the confirmed ward only.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createWardResidenceReviewRepository } from './ward-residence-review.repository.ts';
import { member } from '../schema/member.ts';
import { residenceReview } from '../schema/residence-review.ts';
import {
  createMember,
  createStaffUser,
  createTestDatabase,
  createWard,
  testId,
} from '../testing/index.ts';

describe('ward residence review repository', () => {
  it('records a review with its method, decision and private note', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const staffId = await createStaffUser(database.db);
      const repository = createWardResidenceReviewRepository(database.db);
      const reviewId = testId('rvd');

      await repository.record({
        id: reviewId,
        memberId,
        reviewerId: staffId,
        method: 'ward_confirmation',
        notes: 'Confirmed at the Agbowo ward meeting.',
        decision: 'checked',
        reviewedAt: '2026-01-07T10:00:00Z',
      });

      const rows = await database.db
        .select()
        .from(residenceReview)
        .where(eq(residenceReview.id, reviewId));
      expect(rows[0]).toMatchObject({
        memberId,
        reviewerId: staffId,
        method: 'ward_confirmation',
        decision: 'checked',
        notes: 'Confirmed at the Agbowo ward meeting.',
        reviewedAt: '2026-01-07T10:00:00Z',
      });
    } finally {
      await database.dispose();
    }
  });

  it('lists resolved members whose residence is not accepted, oldest registration first', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db, { name: 'Ward IV, Agbowo' });
      const earlier = await createMember(database.db, {
        wardId,
        displayName: 'Bola O.',
        createdAt: '2026-01-04T09:00:00Z',
      });
      const later = await createMember(database.db, {
        wardId,
        displayName: 'Seun A.',
        createdAt: '2026-01-06T09:00:00Z',
      });
      // Checked: accepted, so off the list.
      await createMember(database.db, {
        wardId,
        identityState: 'checked',
        createdAt: '2026-01-03T09:00:00Z',
      });
      // Unresolved: still a description case, not a residence case.
      await createMember(database.db, { createdAt: '2026-01-02T09:00:00Z' });
      // Anonymised: cannot be checked, so it never enters the list.
      const deleted = await createMember(database.db, {
        wardId,
        createdAt: '2026-01-01T09:00:00Z',
      });
      await database.db
        .update(member)
        .set({ deletedAt: '2026-01-08T09:00:00Z' })
        .where(eq(member.id, deleted));

      const repository = createWardResidenceReviewRepository(database.db);
      const page = await repository.listPending({ limit: 20 });

      expect(page.residences).toEqual([
        {
          memberId: earlier,
          displayName: 'Bola O.',
          wardId,
          wardName: 'Ward IV, Agbowo',
          registeredAt: '2026-01-04T09:00:00Z',
        },
        {
          memberId: later,
          displayName: 'Seun A.',
          wardId,
          wardName: 'Ward IV, Agbowo',
          registeredAt: '2026-01-06T09:00:00Z',
        },
      ]);
      expect(Object.keys(page.residences[0] ?? {}).sort()).toEqual([
        'displayName',
        'memberId',
        'registeredAt',
        'wardId',
        'wardName',
      ]);
      expect(await repository.countPending()).toBe(2);
    } finally {
      await database.dispose();
    }
  });

  it('pages by registration order and removes a member once accepted', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const staffId = await createStaffUser(database.db);
      const earlier = await createMember(database.db, {
        wardId,
        createdAt: '2026-01-04T09:00:00Z',
      });
      const later = await createMember(database.db, {
        wardId,
        createdAt: '2026-01-05T09:00:00Z',
      });
      const repository = createWardResidenceReviewRepository(database.db);

      const first = await repository.listPending({ limit: 1 });
      expect(first.residences.map((residence) => residence.memberId)).toEqual([earlier]);
      expect(first.nextCursor).not.toBeNull();

      const second = await repository.listPending({
        limit: 1,
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
      });
      expect(second.residences.map((residence) => residence.memberId)).toEqual([later]);
      expect(second.nextCursor).toBeNull();

      await repository.record({
        id: testId('rvd'),
        memberId: earlier,
        reviewerId: staffId,
        method: 'ward_confirmation',
        decision: 'checked',
        reviewedAt: '2026-01-07T10:00:00Z',
      });
      await database.db
        .update(member)
        .set({ identityState: 'checked' })
        .where(eq(member.id, earlier));

      const after = await repository.listPending({ limit: 20 });
      expect(after.residences.map((residence) => residence.memberId)).toEqual([later]);
      expect(await repository.countPending()).toBe(1);
    } finally {
      await database.dispose();
    }
  });
});
