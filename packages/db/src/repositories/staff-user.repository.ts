/**
 * Staff accounts (`schema.md` StaffUser, `C-092`, `C-068`).
 *
 * The staff user is the person and their permissions; the credential that signs them in lives in
 * `StaffCredential` (`C-093`) and is never read through this repository. Nothing here carries member
 * personal data: a staff record holds a name for the signatory line on a decision and nothing about a
 * resident.
 *
 * `secondFactorEnrolled` is written by exactly one operation - the `C-092` enrolment confirmation -
 * and `C-068` creates every new account unenrolled. The port passes the instant so the caller's clock
 * is the one recorded everywhere in the same unit of work; `StaffUser` has no enrolment timestamp
 * column, because `StaffCredential.secondFactorEnrolledAt` is where that instant lives.
 */
import { eq } from 'drizzle-orm';
import type { StaffUser, StaffUserPort } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { staffUser } from '../schema/staff-user.ts';

/** One repository implements the staff-user port; nothing else writes this table. */
export type StaffUserRepository = StaffUserPort;

/** Maps a stored row to the domain type; an unpopulated ward array reads as no wards. */
function toStaffUser(row: typeof staffUser.$inferSelect): StaffUser {
  return {
    id: row.id,
    fullName: row.fullName,
    role: row.role,
    external: row.external,
    authorisedWardIds: row.authorisedWardIds ?? [],
    secondFactorEnrolled: row.secondFactorEnrolled,
    active: row.active,
    createdAt: row.createdAt,
  };
}

/**
 * Builds the staff-user repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction enrolment confirmation already holds.
 */
export function createStaffUserRepository(executor: Executor): StaffUserRepository {
  const db = executorOf(executor);

  return {
    async get(staffId) {
      const rows = await db.select().from(staffUser).where(eq(staffUser.id, staffId)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toStaffUser(row);
    },

    async setSecondFactorEnrolled(staffId, enrolled, at) {
      // `at` is the caller's clock, kept in the port so every write in the unit of work agrees on the
      // instant; the StaffUser row has no column for it (`schema.md` StaffUser), so it is not stored.
      void at;
      await db
        .update(staffUser)
        .set({ secondFactorEnrolled: enrolled })
        .where(eq(staffUser.id, staffId));
    },
  };
}
