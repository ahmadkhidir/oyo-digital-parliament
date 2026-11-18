/**
 * Record Header tests (`docs/OyoDigitalParliament/screens.md`, Shared / Common Components;
 * `NFR-044`): lockup, menu, ward and sign-in placements, and the axe run in both families and
 * locales.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { RecordHeader } from './RecordHeader';

const DESTINATIONS = [
  { href: '/commitments', label: 'Commitments' },
  { href: '/wards/ODP-012', label: 'Ward report' },
];

function Header(props: Partial<Parameters<typeof RecordHeader>[0]> = {}) {
  return (
    <RecordHeader
      productName="Oyo Digital Parliament"
      homeHref="/"
      markSrc="/brand/mark.svg"
      markAlt="Oyo Digital Parliament mark"
      menuLabel="Menu"
      destinations={DESTINATIONS}
      ward={{ href: '/wards/ODP-012', label: 'Ward 12' }}
      signIn={{ href: '/sign-in', label: 'Sign in' }}
      {...props}
    />
  );
}

describe('RecordHeader', () => {
  it('holds the mark and the product name as one lockup unit, the name a link home', () => {
    render(<Header />);
    expect(screen.getByRole('img', { name: 'Oyo Digital Parliament mark' })).toBeInTheDocument();
    const name = screen.getByRole('link', { name: 'Oyo Digital Parliament' });
    expect(name).toHaveAttribute('href', '/');
    // The name never shortens: no truncation class on the lockup link.
    expect(name.className).toContain('whitespace-nowrap');
  });

  it('yields the mark first when the caller omits it, and never the name', () => {
    // An empty mark source renders no mark: the caller's narrow-screen yield.
    render(<Header markSrc="" markAlt="" />);
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByRole('link', { name: 'Oyo Digital Parliament' })).toBeInTheDocument();
  });

  it('opens the record destinations from the Menu', async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByText('Menu'));
    for (const destination of DESTINATIONS) {
      expect(screen.getByRole('link', { name: destination.label })).toHaveAttribute(
        'href',
        destination.href,
      );
    }
  });

  it('places the ward link, and the sign-in action in both slots it declares', () => {
    render(<Header />);
    expect(screen.getByRole('link', { name: 'Ward 12' })).toHaveAttribute('href', '/wards/ODP-012');
    const signInLinks = screen.getAllByRole('link', { name: 'Sign in' });
    // Fixed bottom right on mobile and inside the menu from tablet.
    expect(signInLinks).toHaveLength(2);
    for (const link of signInLinks) {
      expect(link).toHaveAttribute('href', '/sign-in');
    }
  });

  it('renders no sign-in slot when the visitor is signed in', () => {
    render(<Header signIn={null} />);
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const [lang, header] of [
      ['en', <Header />],
      [
        'yo',
        <RecordHeader
          productName="Páàrémentì Ọ̀yọ́"
          homeHref="/"
          markSrc="/brand/mark.svg"
          markAlt="Àmì Páàrémentì Ọ̀yọ́"
          menuLabel="Akojọ"
          destinations={[
            { href: '/commitments', label: 'Ìfọwọ́sí' },
            { href: '/wards/ODP-012', label: 'Ìjábọ̀ wádìí' },
          ]}
          ward={{ href: '/wards/ODP-012', label: 'Wádìí 12' }}
          signIn={{ href: '/sign-in', label: 'Ìwọlé' }}
        />,
      ],
    ] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(header);
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
