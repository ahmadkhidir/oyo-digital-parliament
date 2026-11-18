/**
 * The number-confirmation screen's state tests (`screens/04-number-confirmation.md`, `C-003`,
 * `C-004`).
 *
 * Each test renders the real page with the pending record a state needs, and asserts the state by
 * its readable content. The wrong-code sentence carries the attempts remaining the contract puts
 * on the refusal; the expired-code state leads with the resend; a dead registration hands the
 * visitor back to the form.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createPortsDouble, FIXED_NOW } from '../../../../test/identity-double';
import { catalogues } from '../../../../messages';
import { interpolate } from '../../../../lib/i18n/format';
import type { IdentityPorts, PendingRegistration } from '@odp/domain';

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
  double: null as ReturnType<typeof import('../../../../test/identity-double').createPortsDouble> | null,
}));
vi.mock('../../../../lib/identity/ports', () => ({
  getIdentityDependencies: async () => ({
    platform: {},
    ports: holder.ports as IdentityPorts,
    database: {},
  }),
}));

import ConfirmPage from './page';

const PENDING_ID = 'prg_DOUBLESEED0000000000000001';

/** Seeds one pending registration, live unless overridden, and points the flow cookie at it. */
function seedPending(overrides: Partial<PendingRegistration> = {}): void {
  holder.double?.pending.set(PENDING_ID, {
    id: PENDING_ID,
    telephoneNumber: '+2348031234567',
    fullName: 'Oluwaseun Adeyemi',
    displayName: 'Seun A.',
    declaredAge: 24,
    locale: 'en-NG',
    codeSentAt: FIXED_NOW,
    expiresAt: '2026-11-19T09:00:00Z',
    createdAt: FIXED_NOW,
    ...overrides,
  });
  jar.set('odp_join_pending', JSON.stringify({ id: PENDING_ID, delayed: false }));
}

/** Plants one confirmation outcome, as an action's redirect would. */
function seedStatus(cause: string, extra: Record<string, number> = {}): void {
  jar.set('odp_join_status', JSON.stringify({ at: new Date().toISOString(), cause, ...extra }));
}

describe('ConfirmPage (screens/04-number-confirmation.md)', () => {
  beforeEach(() => {
    jar.clear();
    holder.double = createPortsDouble();
    holder.ports = holder.double.ports;
  });

  it('renders the awaiting-input state: the number in full, the code field, the resend, the note', async () => {
    seedPending();
    const copy = catalogues['en-NG'].confirm;

    render(await ConfirmPage());

    expect(
      screen.getByText(
        interpolate(catalogues['en-NG'].confirm.numberIntro, { number: '+2348031234567' }),
      ),
    ).toBeInTheDocument();
    const code = screen.getByLabelText(copy.codeLabel);
    expect(code).toHaveAttribute('inputmode', 'numeric');
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expect(code).toHaveValue(''); // The field is empty on arrival (`screens/04`).
    expect(screen.getByRole('button', { name: copy.confirm })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.resend })).toBeInTheDocument();
    expect(screen.getByText(copy.deliveryNote)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: copy.changeNumber })).toHaveAttribute('href', '/join');
  });

  it('states the attempts remaining on a wrong code (Incorrect)', async () => {
    seedPending();
    seedStatus('CODE_INCORRECT', { attemptsRemaining: 2 });
    const copy = catalogues['en-NG'].confirm;

    render(await ConfirmPage());

    expect(screen.getByRole('alert')).toHaveTextContent('You have 2 tries left.');
    expect(screen.getByLabelText(copy.codeLabel)).toHaveAttribute('aria-invalid', 'true');
  });
  it('states the last try in its own sentence', async () => {
    seedPending();
    seedStatus('CODE_INCORRECT', { attemptsRemaining: 1 });
    const copy = catalogues['en-NG'].confirm;

    render(await ConfirmPage());

    expect(screen.getByRole('alert')).toHaveTextContent(copy.incorrectOne);
  });

  it('offers the resend as the lead action when the code has expired (Expired)', async () => {
    seedPending();
    seedStatus('CODE_EXPIRED');
    const copy = catalogues['en-NG'].confirm;

    render(await ConfirmPage());

    expect(screen.getByRole('alert')).toHaveTextContent(copy.expired);
    expect(screen.getByRole('button', { name: copy.resend })).toBeInTheDocument();
  });

  it('names the cooldown after the tries are used up, with the resend offered', async () => {
    seedPending();
    seedStatus('CODE_ATTEMPTS_EXCEEDED', { retryAfterSeconds: 60 });

    render(await ConfirmPage());

    expect(screen.getByRole('alert')).toHaveTextContent('about one minute');
  });

  it('reports the channel failure with the pending registration preserved (Delivery failed)', async () => {
    seedPending();
    seedStatus('RESEND_FAILED');
    const copy = catalogues['en-NG'].confirm;

    render(await ConfirmPage());

    expect(screen.getByRole('alert')).toHaveTextContent(copy.resendFailed);
  });

  it('explains the resend cooldown as time remaining (Cooling down)', async () => {
    seedPending();
    seedStatus('RESEND_COOLDOWN', { retryAfterSeconds: 45 });

    render(await ConfirmPage());

    expect(screen.getByRole('alert')).toHaveTextContent('45 seconds');
  });

  it('confirms a fresh send (Delivery delayed note and the resent status)', async () => {
    seedPending();
    seedStatus('RESENT');

    render(await ConfirmPage());

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('A new code is on its way to +2348031234567.');
  });

  it('hands the visitor back to the form when the registration has expired', async () => {
    // A dead record behind a live-looking pointer: the pending record is absent.
    jar.set('odp_join_pending', JSON.stringify({ id: PENDING_ID, delayed: false }));
    const copy = catalogues['en-NG'].confirm;

    render(await ConfirmPage());

    expect(screen.getByRole('alert')).toHaveTextContent(copy.expiredRegistration);
    expect(screen.getByRole('link', { name: copy.backToForm })).toHaveAttribute('href', '/join');
  });

  it('leads with the held-dispatch wording when the first code was never sent', async () => {
    seedPending();
    jar.set('odp_join_pending', JSON.stringify({ id: PENDING_ID, delayed: true }));

    render(await ConfirmPage());

    expect(
      screen.getByText(
        interpolate(catalogues['en-NG'].confirm.numberIntroHeld, { number: '+2348031234567' }),
      ),
    ).toBeInTheDocument();
  });

  it('renders the yo-NG catalogue for the awaiting-input state', async () => {
    jar.set('odp_locale', 'yo-NG');
    seedPending();
    const copy = catalogues['yo-NG'].confirm;

    render(await ConfirmPage());

    expect(
      screen.getByText(
        interpolate(catalogues['yo-NG'].confirm.numberIntro, { number: '+2348031234567' }),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.confirm })).toBeInTheDocument();
    expect(screen.queryByText(catalogues['en-NG'].confirm.heading)).toBeNull();
  });
});
