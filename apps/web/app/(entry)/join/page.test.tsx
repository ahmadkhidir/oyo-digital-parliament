/**
 * The registration screen's state tests (`screens/03-registration-form.md`, `C-002`).
 *
 * Each test renders the real page with the flow cookies a state needs in place, and asserts the
 * state by its readable content — never by a class name. The last test renders the yo-NG locale,
 * because both launch locales must render the screen with no hardcoded copy.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createPortsDouble } from '../../../test/identity-double';
import { catalogues } from '../../../messages';
import type { IdentityPorts } from '@odp/domain';

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

const holder = vi.hoisted(() => ({
  ports: null as IdentityPorts | null,
  double: null as ReturnType<
    typeof import('../../../test/identity-double').createPortsDouble
  > | null,
}));
vi.mock('../../../lib/identity/ports', () => ({
  getIdentityDependencies: async () => ({
    platform: {},
    ports: holder.ports as IdentityPorts,
    database: {},
  }),
}));

import JoinPage from './page';

/** The double for the current test; every test seeds it in `beforeEach`. */
function theDouble(): NonNullable<typeof holder.double> {
  const current = holder.double;
  if (current === null) throw new Error('the port double is not seeded');
  return current;
}
/** Seeds one live pending registration and points the flow cookie at it. */
function seedPending(id: string, overrides: Record<string, unknown> = {}): void {
  theDouble().pending.set(id, {
    id,
    telephoneNumber: '+2348031234567',
    fullName: 'Oluwaseun Adeyemi',
    displayName: 'Seun A.',
    declaredAge: 24,
    locale: 'en-NG',
    codeSentAt: '2026-11-18T09:00:00Z',
    expiresAt: '2026-11-19T09:00:00Z',
    createdAt: '2026-11-18T09:00:00Z',
    ...overrides,
  });
  jar.set('odp_join_pending', JSON.stringify({ id, delayed: false }));
}

/** The identifier the seeded pending record carries. */
const PENDING_ID = 'prg_DOUBLESEED0000000000000001';

describe('JoinPage (screens/03-registration-form.md)', () => {
  beforeEach(() => {
    jar.clear();
    holder.double = createPortsDouble();
    holder.ports = holder.double.ports;
  });

  it('renders the default state: statement, eligibility, four fields, send action', async () => {
    const copy = catalogues['en-NG'].join;
    render(await JoinPage());

    expect(screen.getByRole('heading', { name: copy.publicationHeading })).toBeInTheDocument();
    expect(screen.getByText(copy.eligibility)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.fields.fullName.label)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.fields.declaredAge.label)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.fields.telephoneNumber.label)).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        `${copy.fields.displayName.label} (${copy.fields.displayName.optional})`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.sendCode })).toBeInTheDocument();
    // The privacy notice opens in a new page without leaving the form (`screens/03` edge case).
    const privacy = screen.getByRole('link', { name: copy.privacyLink });
    expect(privacy).toHaveAttribute('href', '/privacy');
    expect(privacy).toHaveAttribute('target', '_blank');
  });

  it('names each failing field and keeps the typed text (Validation error)', async () => {
    const copy = catalogues['en-NG'].join;
    jar.set(
      'odp_join_retry',
      JSON.stringify({
        at: new Date().toISOString(),
        values: {
          fullName: 'Oluwaseun Adeyemi',
          declaredAge: '12',
          telephoneNumber: '0803 123 45',
          displayName: '',
        },
        fields: { telephoneNumber: 'PATTERN_MISMATCH', declaredAge: 'OUT_OF_BAND' },
      }),
    );

    render(await JoinPage());

    // Each failing field carries its own sentence, bound to its control.
    expect(
      screen.getByText(copy.fields.telephoneNumber.errors.PATTERN_MISMATCH),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.fields.declaredAge.errors.OUT_OF_BAND)).toBeInTheDocument();
    const number = screen.getByLabelText(copy.fields.telephoneNumber.label);
    expect(number).toHaveAttribute('aria-invalid', 'true');
    // The typed text is kept (`screens/03` Validation error).
    expect(number).toHaveValue('0803 123 45');
    expect(screen.getByLabelText(copy.fields.fullName.label)).toHaveValue('Oluwaseun Adeyemi');
    // The summary names the failing fields; the per-field errors are live regions of their own.
    expect(
      screen
        .getAllByRole('alert')
        .some((element) => element.textContent?.includes(copy.errorSummaryHeading)),
    ).toBe(true);
  });

  it('renders the delivery-failed state with the continue action, form intact', async () => {
    const copy = catalogues['en-NG'].join;
    theDouble().pending.set(PENDING_ID, {
      id: PENDING_ID,
      telephoneNumber: '+2348031234567',
      fullName: 'Oluwaseun Adeyemi',
      displayName: 'Seun A.',
      declaredAge: 24,
      locale: 'en-NG',
      codeSentAt: '2026-11-18T09:00:00Z',
      expiresAt: '2026-11-19T09:00:00Z',
      createdAt: '2026-11-18T09:00:00Z',
    });
    jar.set('odp_join_pending', JSON.stringify({ id: PENDING_ID, delayed: true }));

    render(await JoinPage());

    expect(screen.getByRole('alert')).toHaveTextContent(copy.deliveryDelayedHeading);
    const next = screen.getByRole('link', { name: copy.deliveryDelayedContinue });
    expect(next).toHaveAttribute('href', '/join/confirm');
    // The form is preserved, prefilled from the held pending registration.
    expect(screen.getByLabelText(copy.fields.telephoneNumber.label)).toHaveValue('+2348031234567');
  });

  it('keeps the place and the form for a returning visitor with a live registration', async () => {
    const copy = catalogues['en-NG'].join;
    seedPending(PENDING_ID);

    render(await JoinPage());

    expect(screen.getByText(copy.pendingNotice)).toBeInTheDocument();
    expect(screen.getByLabelText(copy.fields.fullName.label)).toHaveValue('Oluwaseun Adeyemi');
  });

  it('renders the yo-NG catalogue with no English copy', async () => {
    jar.set('odp_locale', 'yo-NG');
    const copy = catalogues['yo-NG'].join;
    render(await JoinPage());

    expect(screen.getByRole('heading', { name: copy.publicationHeading })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.sendCode })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: catalogues['en-NG'].join.publicationHeading }),
    ).toBeNull();
  });
});
