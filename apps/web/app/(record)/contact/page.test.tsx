/**
 * The Contact route's two states and its two session branches (`screens/27-contact.md`).
 *
 * The page is driven for real: the session read is stubbed, the deployment value comes from the
 * environment, and the test asserts what a resident sees — the configured form or the fallback
 * state — never how the page is styled. The last test proves the page collects nothing, because
 * the screen exists so that no submission text, telephone number or ward description is captured
 * by this application.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { catalogues } from '../../../messages';

/** The browser's locale cookie; one jar per test. */
const jar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
}));

type Session =
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'degraded' }
  | {
      readonly kind: 'member';
      readonly token: string;
      readonly member: {
        readonly wardId: string;
        readonly wardStatus: 'resolved' | 'unresolved';
        readonly locale: 'en-NG' | 'yo-NG';
      };
    };

/** The session and ward the page reads; swapped per test. */
const holder = vi.hoisted(() => ({
  session: { kind: 'signed-out' } as Session,
}));

vi.mock('../me/_lib/runtime', () => ({
  resolveMyRecordSession: async () => holder.session,
  readWardName: async () => null,
}));

import ContactPage from './page';

const copy = catalogues['en-NG'].contact;
const yo = catalogues['yo-NG'].contact;
const FORM = 'https://forms.example.org/odp-contact';

/** Sets the deployment value for one test and restores it afterwards. */
function setChannel(value: string | undefined): void {
  if (value === undefined) delete process.env.CONTACT_FORM_URL;
  else process.env.CONTACT_FORM_URL = value;
}

const previousChannel = process.env.CONTACT_FORM_URL;

describe('ContactPage (screens/27-contact.md)', () => {
  beforeEach(() => {
    jar.clear();
    holder.session = { kind: 'signed-out' };
    setChannel(FORM);
  });

  afterEach(() => {
    setChannel(previousChannel);
  });

  it('renders the Default state with the configured channel', async () => {
    const { container } = render(await ContactPage());

    expect(screen.getByRole('heading', { level: 1, name: copy.heading })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.channelLabel })).toHaveAttribute('href', FORM);
    expect(screen.getByText(copy.responseTime)).toBeInTheDocument();
    expect(screen.getByText(copy.caution)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.privacyRights })).toHaveAttribute(
      'href',
      '/privacy',
    );
    // The screen collects nothing itself: no control, no field, no form.
    expect(container.querySelector('form')).toBeNull();
    expect(container.querySelector('input')).toBeNull();
  });

  it('renders the Error state when the deployment has no channel', async () => {
    setChannel(undefined);
    render(await ContactPage());

    expect(screen.getByRole('alert')).toHaveTextContent(copy.errorHeading);
    const mailbox = screen.getByRole('link', { name: copy.mailboxLabel });
    expect(mailbox.getAttribute('href')).toMatch(/^mailto:/);
    expect(screen.getByRole('link', { name: copy.privacyRights })).toHaveAttribute(
      'href',
      '/privacy',
    );
    expect(screen.queryByRole('link', { name: new RegExp(copy.channelLabel) })).toBeNull();
  });

  it('offers My Record to a signed-in member', async () => {
    holder.session = {
      kind: 'member',
      token: 'opaque-token',
      member: { wardId: 'ward_01', wardStatus: 'resolved', locale: 'en-NG' },
    };

    render(await ContactPage());

    expect(screen.getByRole('link', { name: copy.myRecordRights })).toHaveAttribute('href', '/me');
    expect(screen.queryByText(copy.signedOutRightsNote)).toBeNull();
  });

  it("renders the member's own language", async () => {
    holder.session = {
      kind: 'member',
      token: 'opaque-token',
      member: { wardId: 'ward_01', wardStatus: 'unresolved', locale: 'yo-NG' },
    };

    render(await ContactPage());

    expect(screen.getByRole('heading', { level: 1, name: yo.heading })).toBeInTheDocument();
    expect(screen.getByText(yo.responseTime)).toBeInTheDocument();
    expect(screen.queryByText(copy.responseTime)).toBeNull();
  });

  it('renders in Yoruba for a visitor whose session chose it', async () => {
    jar.set('odp_locale', 'yo-NG');

    render(await ContactPage());

    expect(screen.getByRole('heading', { level: 1, name: yo.heading })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: yo.privacyRights })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('tells a signed-out visitor where the rights live without offering My Record', async () => {
    render(await ContactPage());

    expect(screen.queryByRole('link', { name: copy.myRecordRights })).toBeNull();
    expect(screen.getByText(copy.signedOutRightsNote)).toBeInTheDocument();
  });
});
