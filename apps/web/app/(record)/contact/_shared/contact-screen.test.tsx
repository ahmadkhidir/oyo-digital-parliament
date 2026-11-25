/**
 * The Contact screen's states and keyboard reach (`screens/27-contact.md`, `NFR-044`).
 *
 * Both declared states are rendered for real: the Default state with a configured channel, and the
 * Error state with none, which must state the fallback mailbox and the rights route instead of
 * rendering a link that goes nowhere. The last test walks the page with the Tab key, because the
 * screen is read and navigated with no client JavaScript at all.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { catalogues } from '../../../../messages';
import { ContactScreen, type ContactScreenProps } from './contact-screen';

const copy = catalogues['en-NG'].contact;
const MAILBOX = 'mailto:privacy@example.org';
const FORM = 'https://forms.example.org/odp-contact';

/** Renders the screen with the Default channel unless a test says otherwise. */
function renderScreen(overrides: Partial<ContactScreenProps> = {}) {
  const props: ContactScreenProps = {
    copy,
    channel: { kind: 'configured', formUrl: FORM },
    signedIn: false,
    mailboxHref: MAILBOX,
    ...overrides,
  };
  return render(<ContactScreen {...props} />);
}

describe('ContactScreen (screens/27-contact.md)', () => {
  it('renders the Default state: the channel, its response time, the caution and the rights', () => {
    renderScreen();

    expect(screen.getByRole('heading', { level: 1, name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.intro)).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { level: 2, name: copy.channelHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.channelBody)).toBeInTheDocument();
    expect(screen.getByText(copy.responseTime)).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { level: 2, name: copy.cautionHeading }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.caution)).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 2, name: copy.rightsHeading })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.privacyRights })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.getByText(copy.disclosure)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.backToRecord })).toHaveAttribute('href', '/');
  });

  it('opens the configured form in a new page, and says so in words', () => {
    renderScreen();

    const channel = screen.getByRole('link', { name: copy.channelLabel });
    expect(channel).toHaveAttribute('href', FORM);
    expect(channel).toHaveAttribute('target', '_blank');
    expect(channel.getAttribute('rel')).toContain('noopener');
    expect(channel.getAttribute('rel')).toContain('noreferrer');
    // The new page is announced in words, not by an icon or a tint (`NFR-044`).
    expect(screen.getByText(copy.channelNewTab)).toBeInTheDocument();
  });

  it('offers My Record to a signed-in member and the notice alone to a visitor', () => {
    const { unmount } = renderScreen({ signedIn: true });
    expect(screen.getByRole('link', { name: copy.myRecordRights })).toHaveAttribute('href', '/me');
    expect(screen.queryByText(copy.signedOutRightsNote)).toBeNull();
    unmount();

    renderScreen({ signedIn: false });
    expect(screen.queryByRole('link', { name: copy.myRecordRights })).toBeNull();
    expect(screen.getByText(copy.signedOutRightsNote)).toBeInTheDocument();
  });

  it('renders the Error state with the fallback mailbox and the rights, never a dead link', () => {
    renderScreen({ channel: { kind: 'unavailable' } });

    expect(screen.getByRole('heading', { level: 1, name: copy.heading })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(copy.errorHeading);
    expect(screen.getByText(copy.errorBody)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.mailboxLabel })).toHaveAttribute('href', MAILBOX);
    expect(screen.getByRole('link', { name: copy.privacyRights })).toHaveAttribute(
      'href',
      '/privacy',
    );

    // Nothing on the page claims to open a form that is not configured.
    expect(screen.queryByRole('link', { name: new RegExp(copy.channelLabel) })).toBeNull();
    for (const link of screen.getAllByRole('link')) {
      expect(link).toHaveAttribute('href');
      expect(link.getAttribute('href')).not.toBe('#');
    }
  });

  it('renders the Yoruba screen with no English copy', () => {
    const yo = catalogues['yo-NG'].contact;
    renderScreen({ copy: yo });

    expect(screen.getByRole('heading', { level: 1, name: yo.heading })).toBeInTheDocument();
    expect(screen.getByText(yo.intro)).toBeInTheDocument();
    expect(screen.getByText(yo.responseTime)).toBeInTheDocument();
    expect(screen.getByText(yo.caution)).toBeInTheDocument();
    expect(screen.queryByText(copy.intro)).toBeNull();
  });

  it("keeps the Default state's links reachable by keyboard in both locales", async () => {
    for (const localeCopy of [copy, catalogues['yo-NG'].contact]) {
      const user = userEvent.setup();
      const { unmount } = renderScreen({ copy: localeCopy });

      const expected = [
        screen.getByRole('link', { name: localeCopy.channelLabel }),
        screen.getByRole('link', { name: localeCopy.privacyRights }),
        screen.getByRole('link', { name: localeCopy.backToRecord }),
      ];

      for (const link of expected) {
        await user.tab();
        expect(link).toHaveFocus();
      }

      unmount();
    }
  });

  it('keeps the Error state reachable by keyboard', async () => {
    const user = userEvent.setup();
    renderScreen({ channel: { kind: 'unavailable' } });

    for (const link of [
      screen.getByRole('link', { name: copy.mailboxLabel }),
      screen.getByRole('link', { name: copy.privacyRights }),
      screen.getByRole('link', { name: copy.backToRecord }),
    ]) {
      await user.tab();
      expect(link).toHaveFocus();
    }
  });
});
