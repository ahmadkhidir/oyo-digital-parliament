/**
 * The landing's role mapping (`screens/26-admin-home.md`, `operations.md` Roles and permissions).
 *
 * The test pins the least-privilege rule: a role sees only the queues it may work, and the operator
 * is the one role that reaches the data-request queue and the credential panel.
 */
import { describe, expect, it } from 'vitest';
import { destinationsForRole, roleMayOpen } from './destinations';

describe('admin destinations', () => {
  it('gives response staff the ward review queue and nothing else', () => {
    expect(destinationsForRole('response_staff').map((entry) => entry.key)).toEqual([
      'ward-review',
    ]);
  });

  it('gives the operator the queues and the credential panel', () => {
    expect(destinationsForRole('operator').map((entry) => entry.key)).toEqual([
      'ward-review',
      'data-requests',
      'staff-credentials',
    ]);
  });

  it('keeps a moderator, legal reviewer, external reviewer and ward organiser out of both queues', () => {
    for (const role of ['moderator', 'legal_reviewer', 'external_reviewer', 'ward_organiser'] as const) {
      expect(destinationsForRole(role)).toEqual([]);
      expect(roleMayOpen(role, 'data-requests')).toBe(false);
      expect(roleMayOpen(role, 'ward-review')).toBe(false);
    }
  });

  it('refuses the data-request queue to response staff', () => {
    expect(roleMayOpen('response_staff', 'data-requests')).toBe(false);
    expect(roleMayOpen('response_staff', 'ward-review')).toBe(true);
  });
});
