/**
 * The staff authentication frame's landmark contract (`screens/24-staff-sign-in.md`,
 * `screens/25-staff-totp.md`, `NFR-044`).
 *
 * The document shell owns the one `main` landmark and the `#content` anchor the skip link targets.
 * The frame must not render a second one, so a screen reader is offered one main landmark and a
 * keyboard user one skip target.
 */
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
  }),
}));

import RootLayout from '../../../layout';
import { StaffAuthScreen } from './staff-auth-screen';

describe('StaffAuthScreen landmarks (NFR-044)', () => {
  it('adds no second main landmark and no duplicate skip target', async () => {
    const tree = await RootLayout({
      children: (
        <StaffAuthScreen
          productName="Oyo Digital Parliament"
          title="Staff sign in"
          disclosure="A campaign instrument, disclosed as one."
        >
          <p>Sign in with your staff username.</p>
        </StaffAuthScreen>
      ),
    });

    const { container } = render(tree);

    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(container.querySelectorAll('#content')).toHaveLength(1);
    expect(container.querySelector('main')).toHaveAttribute('id', 'content');
  });
});
