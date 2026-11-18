/**
 * The confirmation actions' tests (`C-003` and `C-004`, `screens/04-number-confirmation.md`).
 *
 * The tests drive the real actions against the in-memory port double, with a pending
 * registration seeded into the double and its pointer in the flow cookie — exactly what the
 * screen hands the action after `/join` has run.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPortsDouble, DOUBLE_CODE, FIXED_NOW } from '../../../../test/identity-double';
import type { IdentityPorts, PendingRegistration } from '@odp/domain';

/** The redirect the action answers with; Next throws it out of the action. */
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

import {
  confirmRegistrationAction,
  resendRegistrationCodeAction,
} from './actions';

/** The double for the current test; every test seeds it in `beforeEach`. */
function theDouble(): NonNullable<typeof holder.double> {
  const current = holder.double;
  if (current === null) throw new Error('the port double is not seeded');
  return current;
}

/** Seeds one live pending registration and points the flow cookie at it. */
function seedPending(overrides: Partial<PendingRegistration> = {}): void {
  const double = theDouble();
  const record: PendingRegistration = {
    id: 'prg_DOUBLESEED0000000000000001',
    telephoneNumber: '+2348031234567',
    fullName: 'Oluwaseun Adeyemi',
    displayName: 'Seun A.',
    declaredAge: 24,
    locale: 'en-NG',
    codeSentAt: FIXED_NOW,
    expiresAt: '2026-11-19T09:00:00Z',
    createdAt: FIXED_NOW,
    ...overrides,
  };
  double.pending.set(record.id, record);
  double.codes.set(record.id, { code: DOUBLE_CODE, attempts: 0 });
  jar.set('odp_join_pending', JSON.stringify({ id: record.id, delayed: false }));
}

/** Runs one action and captures its redirect. */
async function run(action: (formData: FormData) => Promise<void>, formData?: FormData): Promise<Redirected> {
  try {
    await action(formData ?? new FormData());
    throw new Error('the action was expected to redirect');
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

function flowCookie<T>(name: string): T | null {
  const raw = jar.get(name);
  return raw === undefined || raw === '' ? null : (JSON.parse(raw) as T);
}

function codeForm(code: string): FormData {
  const form = new FormData();
  form.set('code', code);
  return form;
}

describe('confirmRegistrationAction (C-003)', () => {
  beforeEach(() => {
    jar.clear();
    holder.double = createPortsDouble();
    holder.ports = holder.double.ports;
  });

  it('creates the account, opens the session and moves to the ward screen', async () => {
    seedPending();

    const redirect = await run(confirmRegistrationAction, codeForm(DOUBLE_CODE));

    expect(redirect.url).toBe('/join/ward');
    expect(theDouble().members).toHaveLength(1);
    expect(theDouble().members[0]?.identityState).toBe('registered');
    expect(theDouble().audit.map((event) => event.action)).toContain('member.registered');
    // The session cookie the use case built is set with its lifetime (`C-003`, `NFR-026`).
    const sessionCookie = jar.get('odp_session');
    expect(sessionCookie).toBe('sessiontoken0123456789abcdef');
    // The flow is finished: the pointer and any status are gone.
    expect(flowCookie('odp_join_pending')).toBeNull();
    expect(flowCookie('odp_join_status')).toBeNull();
    expect(theDouble().events.map((event) => event.name)).toContain('account_registered');
  });

  it('states the attempts remaining and clears the field on a wrong code (Incorrect)', async () => {
    seedPending();

    const redirect = await run(confirmRegistrationAction, codeForm('000000'));

    expect(redirect.url).toBe('/join/confirm');
    expect(theDouble().members).toHaveLength(0); // No account until the code is proved.
    const status = flowCookie<{ cause: string; attemptsRemaining?: number }>('odp_join_status');
    expect(status?.cause).toBe('CODE_INCORRECT');
    expect(status?.attemptsRemaining).toBe(2);
  });

  it('cools down after the tries are used up, and offers the resend (RATE_LIMITED)', async () => {
    seedPending();

    await run(confirmRegistrationAction, codeForm('000001'));
    await run(confirmRegistrationAction, codeForm('000002'));
    const redirect = await run(confirmRegistrationAction, codeForm('000003'));

    expect(redirect.url).toBe('/join/confirm');
    const status = flowCookie<{ cause: string; retryAfterSeconds?: number }>('odp_join_status');
    expect(status?.cause).toBe('CODE_ATTEMPTS_EXCEEDED');
    expect(status?.retryAfterSeconds).toBe(60);
    expect(theDouble().members).toHaveLength(0);
  });

  it('answers expired for a code whose window has closed (Expired)', async () => {
    seedPending();
    theDouble().codes.delete('prg_DOUBLESEED0000000000000001'); // No stored code: the window closed.

    const redirect = await run(confirmRegistrationAction, codeForm(DOUBLE_CODE));

    expect(redirect.url).toBe('/join/confirm');
    const status = flowCookie<{ cause: string }>('odp_join_status');
    expect(status?.cause).toBe('CODE_EXPIRED');
  });

  it('ends the flow with the notice on the form when the registration has expired', async () => {
    seedPending({ expiresAt: '2026-11-18T08:00:00Z' }); // Already past the fixed instant.

    const redirect = await run(confirmRegistrationAction, codeForm(DOUBLE_CODE));

    expect(redirect.url).toBe('/join');
    expect(flowCookie('odp_join_pending')).toBeNull();
    const retry = flowCookie<{ status?: string }>('odp_join_retry');
    expect(retry?.status).toBe('REGISTRATION_EXPIRED');
  });

  it('refuses a second use of a code that already created an account', async () => {
    seedPending({ verifiedAt: FIXED_NOW });

    const redirect = await run(confirmRegistrationAction, codeForm(DOUBLE_CODE));

    expect(redirect.url).toBe('/join/confirm');
    const status = flowCookie<{ cause: string }>('odp_join_status');
    expect(status?.cause).toBe('CODE_ALREADY_USED');
  });

  it('refuses a malformed code at the boundary, naming the code field', async () => {
    seedPending();

    const redirect = await run(confirmRegistrationAction, codeForm('12ab'));

    expect(redirect.url).toBe('/join/confirm');
    const status = flowCookie<{ cause: string }>('odp_join_status');
    expect(status?.cause).toBe('PATTERN_MISMATCH');
  });
});

describe('resendRegistrationCodeAction (C-004)', () => {
  beforeEach(() => {
    jar.clear();
    holder.double = createPortsDouble();
    holder.ports = holder.double.ports;
  });

  it('issues a fresh code and reports the send', async () => {
    // Seeded an hour before the fixed instant, so the one-minute timer has lapsed (`C-004`).
    seedPending({ codeSentAt: '2026-11-18T08:00:00Z' });

    const redirect = await run(resendRegistrationCodeAction);

    expect(redirect.url).toBe('/join/confirm');
    const status = flowCookie<{ cause: string }>('odp_join_status');
    expect(status?.cause).toBe('RESENT');
    // The record's dispatch time moved, so the next render's cooldown restarts from it (`C-004`).
    expect(theDouble().pending.get('prg_DOUBLESEED0000000000000001')?.codeSentAt).toBe(FIXED_NOW);
  });

  it('keeps the pending registration and reports the channel failure (Delivery failed)', async () => {
    holder.double = createPortsDouble({ smsUnavailable: true });
    holder.ports = holder.double.ports;
    // Seeded an hour before the fixed instant, so the one-minute timer is not what refuses.
    seedPending({ codeSentAt: '2026-11-18T08:00:00Z' });

    const redirect = await run(resendRegistrationCodeAction);

    expect(redirect.url).toBe('/join/confirm');
    expect(flowCookie('odp_join_pending')).not.toBeNull(); // The pending registration is preserved (`C-004`).
    const status = flowCookie<{ cause: string }>('odp_join_status');
    expect(status?.cause).toBe('RESEND_FAILED');
  });

  it('states the time remaining while the resend timer cools down', async () => {
    seedPending({ codeSentAt: '2026-11-18T08:59:30Z' }); // Thirty seconds before the fixed instant.

    const redirect = await run(resendRegistrationCodeAction);

    expect(redirect.url).toBe('/join/confirm');
    const status = flowCookie<{ cause: string; retryAfterSeconds?: number }>('odp_join_status');
    expect(status?.cause).toBe('RESEND_COOLDOWN');
    expect(status?.retryAfterSeconds).toBe(30);
  });

  it('ends the flow when the registration has expired', async () => {
    seedPending({ expiresAt: '2026-11-18T08:00:00Z' });

    const redirect = await run(resendRegistrationCodeAction);

    expect(redirect.url).toBe('/join');
    expect(flowCookie('odp_join_pending')).toBeNull();
  });
});
