/**
 * The Staff credentials panel's composition (`C-093`, `screens/26-admin-home.md`).
 *
 * The staff console already holds one identity bundle, one pool and one set of credential adapters.
 * The reset repository is that same table read and written through a wider port than sign-in uses, so
 * it is built here from the bundle's own database handle and credential adapters rather than opening
 * a second connection or a second hasher. No query is written in this area: the SQL lives in
 * `packages/db` (`apps/web/AGENTS.md` Discipline).
 */
import { createStaffCredentialRepository, type StaffCredentialRepository } from '@odp/db';
import {
  getStaffAdminDependencies,
  type StaffAdminDependencies,
} from '../../../../lib/staff-session/deps';

/** The reset surface plus the bundle every other console screen uses. */
export interface StaffResetDependencies {
  readonly dependencies: StaffAdminDependencies;
  readonly reset: StaffCredentialRepository;
}

/** Builds the reset port once per call from the process-wide bundle. */
export async function getStaffResetDependencies(): Promise<StaffResetDependencies> {
  const dependencies = await getStaffAdminDependencies();
  return {
    dependencies,
    reset: createStaffCredentialRepository(dependencies.database.db, dependencies.credentials),
  };
}
