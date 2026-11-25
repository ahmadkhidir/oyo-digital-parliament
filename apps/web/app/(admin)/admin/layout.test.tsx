/**
 * The guarded admin shell's landmarks (`NFR-044`, `screens/26-admin-home.md`).
 *
 * The document shell renders the one `main` landmark and the skip-link target. The admin shell
 * must not nest a second one, or every console page exposes two mains and a duplicate id.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/** The staff session the shell resolves; only a satisfied session reaches the console. */
const holder = vi.hoisted(() => ({
  access: {
    kind: 'ready',
    staff: { id: 'stf_01', fullName: 'A. Balogun', role: 'operator' },
  },
}));

vi.mock('../../../lib/i18n/locale', () => ({ resolveLocale: async () => 'en-NG' }));

vi.mock('../../../lib/staff-session/session', () => ({
  readStaffAccess: async () => holder.access,
}));

vi.mock('../../../lib/staff-session/actions', () => ({
  signOutStaffAction: async () => {},
}));

import AdminLayout from './layout';

describe('AdminLayout (NFR-044)', () => {
  it('adds no second main landmark or skip target inside the document shell', async () => {
    const { container } = render(await AdminLayout({ children: <p>Console content</p> }));

    expect(container.querySelectorAll('main')).toHaveLength(0);
    expect(container.querySelector('#content')).toBeNull();
    expect(container.textContent).toContain('Console content');
  });
});
