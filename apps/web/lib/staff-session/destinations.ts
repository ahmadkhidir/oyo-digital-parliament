/**
 * The admin landing's role-scoped destinations (`screens/26-admin-home.md`, `operations.md` Roles
 * and permissions).
 *
 * The landing answers one question — what may this person work now — and it must never guess. This
 * module is the single mapping from a staff role to the destinations that role may open. A
 * destination whose screen has not landed in this phase is absent rather than linked to a route that
 * would answer 404: the grid grows as each queue ships, and the role scoping is typed so a new role
 * cannot be added without deciding its destinations.
 */
import type { StaffRole } from '@odp/domain';

/** One destination the landing may show. */
export type AdminDestinationKey = 'ward-review' | 'data-requests' | 'staff-credentials';

/** A destination's stable route and the panel id the landing anchors to. */
export interface AdminDestination {
  readonly key: AdminDestinationKey;
  readonly href: string;
  /** A fragment the same page carries, for a panel that lives on the landing itself. */
  readonly panel?: string;
}

/** Every destination this phase implements. */
const DESTINATIONS: Readonly<Record<AdminDestinationKey, AdminDestination>> = {
  'ward-review': { key: 'ward-review', href: '/admin/wards/review' },
  'data-requests': { key: 'data-requests', href: '/admin/data-requests' },
  'staff-credentials': {
    key: 'staff-credentials',
    href: '/admin#staff-credentials',
    panel: 'staff-credentials',
  },
};

/**
 * The destinations a role may work.
 *
 * Response staff work the ward review queue. The operator may work every queue above except assisted
 * intake, and the Staff credentials panel sits on the operator's own landing. The remaining roles
 * receive an empty list until the screens their permissions name ship in a later phase; the landing
 * then renders its Empty state rather than inventing a destination.
 */
export function destinationsForRole(role: StaffRole): readonly AdminDestination[] {
  switch (role) {
    case 'response_staff':
      return [DESTINATIONS['ward-review']];
    case 'operator':
      return [
        DESTINATIONS['ward-review'],
        DESTINATIONS['data-requests'],
        DESTINATIONS['staff-credentials'],
      ];
    case 'ward_organiser':
    case 'moderator':
    case 'external_reviewer':
    case 'legal_reviewer':
      return [];
  }
}

/** Whether a role may open one destination. Used by each route's own role check. */
export function roleMayOpen(role: StaffRole, key: AdminDestinationKey): boolean {
  return destinationsForRole(role).some((destination) => destination.key === key);
}
