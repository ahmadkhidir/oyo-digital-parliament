/**
 * The registration action's tests (`C-002`, `screens/03-registration-form.md`).
 *
 * Each test drives the real server action against the in-memory port double, catching the
 * redirect the action answers with and reading the flow cookies it leaves behind. The names cite
 * the screen state or the contract line each one exercises.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createPortsDouble } from '../../../test/identity-double';
import type { IdentityPorts } from '@odp/domain';

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

/** The cookie jar the action reads and writes; one per test via `beforeEach`. */
const jar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => {
      jar.set(name, value);
    },
  }),
  headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.7' }),
}));

/** The ports the action receives, swapped per test. */
const holder = vi.hoisted(() => ({ ports: null as IdentityPorts | null }));
vi.mock('../../../lib/identity/ports', () => ({
  getIdentityDependencies: async () => ({
    platform: {},
    ports: holder.ports as IdentityPorts,
    database: {},
  }),
}));

import { registerResidentAction } from './actions';

/** A form with the four facts, overridable per test. */
function formWith(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('fullName', 'Oluwaseun Adeyemi');
  form.set('declaredAge', '24');
  form.set('telephoneNumber', '+2348031234567');
  form.set('displayName', 'Seun A.');
  for (const [key, value] of Object.entries(overrides)) {
    if (value === '') form.delete(key);
    else form.set(key, value);
  }
  return form;
}

/** Runs the action and captures its redirect. */
async function run(formData: FormData): Promise<Redirected> {
  try {
    await registerResidentAction(formData);
    throw new Error('the action was expected to redirect');
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

/** Reads one flow cookie as the state it holds. */
function flowCookie<T>(name: string): T | null {
  const raw = jar.get(name);
  return raw === undefined || raw === '' ? null : (JSON.parse(raw) as T);
}

describe('registerResidentAction (C-002)', () => {
  beforeEach(() => {
    jar.clear();
  });

  it('stores a pending registration and moves to confirmation on the happy path', async () => {
    const double = createPortsDouble();
    holder.ports = double.ports;

    const redirect = await run(formWith());

    expect(redirect.url).toBe('/join/confirm');
    expect(double.pending.size).toBe(1);
    expect(double.members).toHaveLength(0); // No account exists before the code is accepted.
    // The visitor's place in the flow is the pending record, held in an HttpOnly cookie.
    const pendingCookie = flowCookie<{ id: string; delayed: boolean }>('odp_join_pending');
    expect(pendingCookie?.delayed).toBe(false);
    expect(pendingCookie?.id).toMatch(/^prg_[0-9A-Z]+$/);
    expect(pendingCookie).not.toBeNull();
    expect(flowCookie('odp_join_retry')).toBeNull();
    expect(double.events.map((event) => event.name)).toContain('registration_started');
  });

  it('names each failing field and keeps the typed text on the screen (Validation error)', async () => {
    const double = createPortsDouble();
    holder.ports = double.ports;

    const redirect = await run(formWith({ telephoneNumber: '0803 123 45', declaredAge: '12' }));

    expect(redirect.url).toBe('/join');
    expect(double.pending.size).toBe(0);
    const retry = flowCookie<{ values: Record<string, string>; fields: Record<string, string> }>(
      'odp_join_retry',
    );
    expect(retry?.fields['telephoneNumber']).toBe('PATTERN_MISMATCH');
    expect(retry?.fields['declaredAge']).toBe('OUT_OF_BAND');
    // The submitted values survive the refusal, exactly as they were typed.
    expect(retry?.values.telephoneNumber).toBe('0803 123 45');
    expect(retry?.values.declaredAge).toBe('12');
    expect(retry?.values.fullName).toBe('Oluwaseun Adeyemi');
  });

  it('keeps the pending registration when the dispatch is held (Delivery failed)', async () => {
    const double = createPortsDouble({ smsUnavailable: true });
    holder.ports = double.ports;

    const redirect = await run(formWith());

    expect(redirect.url).toBe('/join');
    expect(double.pending.size).toBe(1); // The pending registration is not lost (`C-002` 201 delayed).
    const pendingCookie = flowCookie<{ id: string; delayed: boolean }>('odp_join_pending');
    expect(pendingCookie?.delayed).toBe(true);
    expect(flowCookie('odp_join_retry')).toBeNull();
  });

  it('offers sign-in instead of a duplicate account for a registered number', async () => {
    const double = createPortsDouble({
      members: [
        {
          id: 'mbr_DOUBLEEXISTING0000000000001',
          telephoneNumber: '+2348031234567',
          fullName: 'Existing Member',
          displayName: 'Existing M.',
          declaredAge: 30,
          wardStatus: 'resolved',
          identityState: 'registered',
          verificationMethod: 'self_code',
          sharedNumber: false,
          locale: 'en-NG',
          createdAt: '2026-11-01T09:00:00Z',
        },
      ],
    });
    holder.ports = double.ports;

    const redirect = await run(formWith());

    expect(redirect.url).toBe('/join');
    expect(double.members).toHaveLength(1); // No duplicate account (`FEAT-001`).
    const retry = flowCookie<{ status?: string; fields: Record<string, string> }>('odp_join_retry');
    expect(retry?.status).toBe('ALREADY_REGISTERED');
    expect(retry?.fields['telephoneNumber']).toBe('ALREADY_SET');
    // The values survive so the visitor can correct or follow the recovery path.
    expect(
      flowCookie<{ values: Record<string, string> }>('odp_join_retry')?.values.telephoneNumber,
    ).toBe('+2348031234567');
  });

  it('refuses the attempt when the source address cap is reached, with the wait', async () => {
    const double = createPortsDouble({ rateLimitRetryAfterSeconds: 120 });
    holder.ports = double.ports;

    const redirect = await run(formWith());

    expect(redirect.url).toBe('/join');
    expect(double.pending.size).toBe(0);
    const retry = flowCookie<{ status?: string; retryAfterSeconds?: number }>('odp_join_retry');
    expect(retry?.status).toBe('RATE_LIMITED');
    expect(retry?.retryAfterSeconds).toBe(120);
  });
});
