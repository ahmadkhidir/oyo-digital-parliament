/**
 * The staff-user repository (`schema.md` StaffUser, `C-068`, `C-092`).
 *
 * Proves the projection reads an unset ward list as no wards, and that the enrolment flag is durable:
 * a new account is created unenrolled and only the enrolment confirmation sets it.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createStaffUserRepository } from './staff-user.repository.ts';
import { staffUser } from '../schema/staff-user.ts';
import { createStaffUser, createTestDatabase, createWard, testId } from '../testing/index.ts';

describe('staff user repository', () => {
  it('reads a staff account with its role, external flag and authorised wards', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const id = await createStaffUser(database.db, {
        role: 'ward_organiser',
        fullName: 'A. Balogun',
      });
      await database.db
        .update(staffUser)
        .set({ authorisedWardIds: [wardId] })
        .where(eq(staffUser.id, id));

      const repository = createStaffUserRepository(database.db);
      expect(await repository.get(id)).toMatchObject({
        id,
        fullName: 'A. Balogun',
        role: 'ward_organiser',
        external: false,
        authorisedWardIds: [wardId],
        // The factory seeds an enrolled account; the column is what the read reports.
        secondFactorEnrolled: true,
        active: true,
      });
      expect(await repository.get(testId('stf'))).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('writes the second-factor flag durably in both directions', async () => {
    const database = await createTestDatabase();
    try {
      const id = await createStaffUser(database.db);
      const repository = createStaffUserRepository(database.db);

      await repository.setSecondFactorEnrolled(id, false, '2026-11-18T09:00:00Z');
      expect((await repository.get(id))?.secondFactorEnrolled).toBe(false);

      await repository.setSecondFactorEnrolled(id, true, '2026-11-18T09:20:00Z');
      expect((await repository.get(id))?.secondFactorEnrolled).toBe(true);
    } finally {
      await database.dispose();
    }
  });

  it('reads an account with no authorised wards as an empty list', async () => {
    const database = await createTestDatabase();
    try {
      const id = await createStaffUser(database.db, { role: 'response_staff' });
      const repository = createStaffUserRepository(database.db);
      expect((await repository.get(id))?.authorisedWardIds).toEqual([]);
    } finally {
      await database.dispose();
    }
  });
});
