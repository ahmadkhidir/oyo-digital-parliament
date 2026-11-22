/**
 * The first staff accounts the campaign needs (`schema.md` StaffUser, `operations.md` Admin &
 * Governance, `C-092`, `C-093`).
 *
 * Two accounts are seeded: the operator, who works the data-request queue and resets credentials, and
 * one response-staff member, who works the decision and ward-review queues. The seed writes the
 * `StaffUser` rows only. It never writes a `StaffCredential`: a password and a second factor are
 * credential material, and no seed may commit either (`NFR-021`, `NFR-024`). Without a credential the
 * account cannot authenticate, which is the intended state until the operator issues one through the
 * credential reset path and the staff member enrols their own factor.
 *
 * The rows are deterministic — fixed identifiers, names, roles and creation instant — so a second run
 * inserts nothing and no re-run rewrites a role or reactivates an account an operator deactivated.
 */
import type { StaffUser } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { staffUser } from '../schema/staff-user.ts';

/** The seed instant, fixed so the rows are byte-identical on every run. */
const SEEDED_AT = '2026-11-01T00:00:00Z';

/** The two accounts, keyed by the stable identifiers the seed owns. */
export const staffSeedRows = (): readonly StaffUser[] => [
  {
    id: 'stf_01J9Z0000000000000000OPER',
    fullName: 'Campaign Operator',
    role: 'operator',
    external: false,
    authorisedWardIds: [],
    secondFactorEnrolled: false,
    active: true,
    createdAt: SEEDED_AT,
  },
  {
    id: 'stf_01J9Z0000000000000000RESP',
    fullName: 'Response Staff',
    role: 'response_staff',
    external: false,
    authorisedWardIds: [],
    secondFactorEnrolled: false,
    active: true,
    createdAt: SEEDED_AT,
  },
];

/** What the staff seed did on this run. */
export interface StaffSeedResult {
  readonly inserted: number;
  readonly existing: number;
}

/**
 * Writes the seeded staff accounts.
 *
 * A row the database already holds is skipped by its primary key, so a second run changes nothing and
 * an account that later gained a role change, a deactivation or a credential is left exactly as the
 * operator left it.
 *
 * @param executor - The shared client, or the transaction the runner already opened.
 */
export async function seedStaff(executor: Executor): Promise<StaffSeedResult> {
  const rows = staffSeedRows();
  const inserted = await executorOf(executor)
    .insert(staffUser)
    .values(
      rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        role: row.role,
        external: row.external,
        authorisedWardIds: [...row.authorisedWardIds],
        secondFactorEnrolled: row.secondFactorEnrolled,
        active: row.active,
        createdAt: row.createdAt,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: staffUser.id });
  return { inserted: inserted.length, existing: rows.length - inserted.length };
}
