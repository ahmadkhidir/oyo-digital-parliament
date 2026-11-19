/**
 * The sign-in screen's state tests (`screens/02-sign-in.md`, `C-005`, `C-006`).
 *
 * Each test renders the real page with the flow cookies — or the presented session — a state
 * needs in place, and asserts the state by its readable content, never by a class name. The last
 * two tests render the yo-NG locale and a signed-in member, because both launch locales must
 * render every state, and a live session never leaves the member on this screen (`NFR-026`).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { IdentityPorts } from '@odp/domain';
import { createPortsDouble, doubleMember, FIXED_NOW } from '../../../test/identity-double';
import { catalogues } from '../../../messages';

/** The redirect the page answers with for a state the screen cannot render. */
class Redirected extends Error {
  readonly url: string;

  constructor(url: string) {
    super(url);
    this.url = url;
  }
}

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Redirected(url);
  },
}));

const jar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
  headers: async () => new Headers(),
}));

const holder = vi.hoisted(() => ({ ports: null as IdentityPorts | null }));
vi.mock('../../../lib/session/deps', () => ({
  getSignInDependencies: async () => holder.ports as IdentityPorts,
}));

import SignInPage from './page';

/** The sign-in challenge port's double, with its rows visible to the test. */
function challengePort() {
  const rows = new Map<
    string,
    {
      telephoneNumber: string;
      memberIds: string[];
      codeSentAt: string;
      expiresAt: string;
      consumedAt?: string;
    }
  >();
  let attempts = 0;
  return {
    rows,
    port: {
      create: async (input: {
        id: string;
        telephoneNumber: string;
        memberIds: readonly string[];
        at: string;
        expiresAt: string;
      }) => {
        attempts += 1;
        rows.set(input.id, {
          telephoneNumber: input.telephoneNumber,
          memberIds: [...input.memberIds],
          codeSentAt: input.at,
          expiresAt: input.expiresAt,
        });
        return { attempt: attempts };
      },
      findById: async (id: string) => {
        const row = rows.get(id);
        return row === undefined
          ? null
          : {
              id,
              telephoneNumber: row.telephoneNumber,
              memberIds: row.memberIds,
              codeSentAt: row.codeSentAt,
              expiresAt: row.expiresAt,
            };
      },
      consume: async (id: string, at: string) => {
        const row = rows.get(id);
        if (row === undefined || row.consumedAt !== undefined) return false;
        rows.set(id, { ...row, consumedAt: at });
        return true;
      },
    },
  };
}

/** The identity double with the challenge port composed, as the page receives it. */
function signInDouble(
  options: Parameters<typeof createPortsDouble>[0] = {},
): ReturnType<typeof createPortsDouble> {
  const base = createPortsDouble(options);
  const challenge = challengePort();
  holder.ports = {
    ...base.ports,
    members: {
      ...base.ports.members,
      // `completeSignIn` reads the chosen account through this port (`C-006`); the base double
      // answers `null` for every id, which would read as a member no longer available.
      get: async (memberId: string) => base.members.find((row) => row.id === memberId) ?? null,
    },
    signInChallenges: challenge.port,
  };
  return { ...base, ports: holder.ports as IdentityPorts };
}

/** Seeds the pending pointer for the code step. */
function seedPending(state: {
  challengeId: string;
  telephoneNumber: string;
  accountChoiceRequired: boolean;
  accountCount: number;
  returnTo: string;
  resendAvailableAt?: string;
}): void {
  jar.set('odp_signin_pending', JSON.stringify(state));
}

/** A challenge row the double's store answers with. */
function challengeRow(
  overrides: Partial<{
    id: string;
    telephoneNumber: string;
    memberIds: string[];
    codeSentAt: string;
    expiresAt: string;
  }> = {},
): {
  id: string;
  telephoneNumber: string;
  memberIds: string[];
  codeSentAt: string;
  expiresAt: string;
} {
  return {
    id: 'sic_DOUBLESEED0000000000000001',
    telephoneNumber: '+2348031234567',
    memberIds: ['mbr_0001'],
    codeSentAt: FIXED_NOW,
    expiresAt: '2026-11-18T09:10:00Z',
    ...overrides,
  };
}

/** The page's props for one render. */
function pageProps(searchParams: Record<string, string> = {}): {
  readonly searchParams: Promise<Record<string, string>>;
} {
  return { searchParams: Promise.resolve(searchParams) };
}

describe('SignInPage (screens/02-sign-in.md)', () => {
  beforeEach(() => {
    jar.clear();
    holder.ports = createPortsDouble().ports;
  });

  it('renders the default state: number field, send action, the code-arrival note', async () => {
    const copy = catalogues['en-NG'].signIn;
    render(await SignInPage(pageProps()));

    expect(screen.getByRole('heading', { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.intro)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.telephoneNumber.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.sendCode })).toBeInTheDocument();
    const create = screen.getByRole('link', { name: copy.createAccount });
    expect(create).toHaveAttribute('href', '/join');
  });

  it('names the failing field and keeps the typed number (Validation error)', async () => {
    const copy = catalogues['en-NG'].signIn;
    jar.set(
      'odp_signin_retry',
      JSON.stringify({
        at: new Date().toISOString(),
        values: { telephoneNumber: '0803 123 45' },
        fields: { telephoneNumber: 'PATTERN_MISMATCH' },
      }),
    );

    render(await SignInPage(pageProps()));

    const field = screen.getByLabelText(copy.telephoneNumber.label);
    expect(field).toHaveValue('0803 123 45');
    expect(screen.getByText(copy.telephoneNumber.errors.PATTERN_MISMATCH)).toBeInTheDocument();
  });

  it('states the wait before another attempt (Rate limited)', async () => {
    jar.set(
      'odp_signin_retry',
      JSON.stringify({
        at: new Date().toISOString(),
        values: { telephoneNumber: '+2348031234567' },
        fields: {},
        status: 'RATE_LIMITED',
        retryAfterSeconds: 45,
      }),
    );

    render(await SignInPage(pageProps()));

    expect(
      screen.getByText('That is too many attempts. Wait 45 seconds, then try again.'),
    ).toBeInTheDocument();
  });

  it('states the failure when the code could not be sent (Delivery failed)', async () => {
    const copy = catalogues['en-NG'].signIn;
    jar.set(
      'odp_signin_retry',
      JSON.stringify({
        at: new Date().toISOString(),
        values: { telephoneNumber: '+2348031234567' },
        fields: {},
        status: 'DELIVERY_FAILED',
      }),
    );

    render(await SignInPage(pageProps()));

    expect(screen.getByText(copy.sendFailed)).toBeInTheDocument();
  });

  it('renders the code step: the number, the code field, the resend timer, the note (Code sent)', async () => {
    const copy = catalogues['en-NG'].signIn;
    signInDouble();
    const row = challengeRow();
    // The challenge store is the composed double's; seed it through the port.
    const ports = holder.ports as IdentityPorts;
    await ports.signInChallenges.create({ ...row, at: row.codeSentAt });
    seedPending({
      challengeId: row.id,
      telephoneNumber: '+2348031234567',
      accountChoiceRequired: false,
      accountCount: 1,
      returnTo: '/',
      resendAvailableAt: '2026-11-18T09:01:00Z',
    });

    render(await SignInPage(pageProps()));

    expect(screen.getByText('We sent a six-digit code to +2348031234567.')).toBeInTheDocument();
    expect(screen.getByLabelText(copy.code.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.confirm })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.resend })).toBeInTheDocument();
    expect(screen.getByText(copy.deliveryNote)).toBeInTheDocument();
    expect(screen.getByText(copy.useDifferentNumber)).toBeInTheDocument();
  });

  it('renders the account choice as positions, never as names (Account choice; C-005)', async () => {
    const copy = catalogues['en-NG'].signIn;
    signInDouble({
      members: [
        doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' }),
        doubleMember({ id: 'mbr_0002', displayName: 'Tunde O.' }),
      ],
    });
    const row = challengeRow({ memberIds: ['mbr_0001', 'mbr_0002'] });
    const ports = holder.ports as IdentityPorts;
    await ports.signInChallenges.create({ ...row, at: row.codeSentAt });
    seedPending({
      challengeId: row.id,
      telephoneNumber: '+2348031234567',
      accountChoiceRequired: true,
      accountCount: 2,
      returnTo: '/',
      resendAvailableAt: '2026-11-18T09:01:00Z',
    });

    render(await SignInPage(pageProps()));

    expect(
      screen.getByText(
        'More than one account uses +2348031234567. Enter the code, then choose the account.',
      ),
    ).toBeInTheDocument();
    const group = screen.getByRole('group', { name: copy.accountChoice.legend });
    expect(within(group).getByRole('radio', { name: 'Account 1 of 2' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Account 2 of 2' })).toBeInTheDocument();
    // The contract reveals the count of a shared number, never the names (`C-005` Authority).
    expect(screen.queryByText('Seun A.')).not.toBeInTheDocument();
    expect(screen.queryByText('Tunde O.')).not.toBeInTheDocument();
  });

  it('renders the expired state with the resend as the lead action (Expired)', async () => {
    const copy = catalogues['en-NG'].signIn;
    signInDouble();
    seedPending({
      challengeId: 'sic_GONE0000000000000000001',
      telephoneNumber: '+2348031234567',
      accountChoiceRequired: false,
      accountCount: 1,
      returnTo: '/',
    });

    render(await SignInPage(pageProps()));

    expect(screen.getByText(copy.codeExpired)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.resend })).toBeInTheDocument();
  });

  it('explains a session that ended elsewhere, then asks for the number (Expired session)', async () => {
    const copy = catalogues['en-NG'].signIn;
    // A presented cookie that names no live session: the base double's read answers `null`.
    jar.set('odp_session', 'deadtoken00000000000000000001');

    render(await SignInPage(pageProps()));

    expect(screen.getByText(copy.sessionEnded)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.telephoneNumber.label)).toBeInTheDocument();
  });

  it('sends a signed-in member back where they came from, never onto this screen', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    const ports = holder.ports as IdentityPorts;
    holder.ports = {
      ...ports,
      members: {
        ...ports.members,
        get: async (memberId: string) => double.members.find((row) => row.id === memberId) ?? null,
      },
      memberSessions: {
        ...ports.memberSessions,
        read: async () => ({
          sessionId: 'sessiontoken0123456789abcdef',
          memberId: 'mbr_0001',
          // An hour out: the double's clock sits at `FIXED_NOW`, and an expiry equal to now is
          // already past (`isPast`, `C-007`).
          expiresAt: '2026-11-18T10:00:00Z',
          absoluteExpiresAt: '2026-11-18T10:00:00Z',
          lastSeenAt: FIXED_NOW,
        }),
      },
    };
    jar.set('odp_session', 'sessiontoken0123456789abcdef');

    await expect(SignInPage(pageProps({ returnTo: '/s/ODP-004821' }))).rejects.toThrow(
      '/s/ODP-004821',
    );
  });

  it('renders every sentence from the yo-NG catalogue', async () => {
    const copy = catalogues['yo-NG'].signIn;
    jar.set('odp_locale', 'yo-NG');

    render(await SignInPage(pageProps()));

    expect(screen.getByRole('heading', { name: copy.heading })).toBeInTheDocument();
    expect(screen.getByLabelText(copy.telephoneNumber.label)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.sendCode })).toBeInTheDocument();
    const create = screen.getByRole('link', { name: copy.createAccount });
    expect(create).toHaveAttribute('href', '/join');
  });
});
