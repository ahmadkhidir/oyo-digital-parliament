/**
 * The sign-in actions' tests (`C-005`, `C-006`, `C-008`; `screens/02-sign-in.md`).
 *
 * Each test drives the real server action against the in-memory port double — the identity
 * double, with the sign-in challenge port this slice composes — catching the redirect the action
 * answers with and reading the flow cookies it leaves behind. The names cite the screen state or
 * the contract line each one exercises.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentityPorts } from '@odp/domain';
import {
  DOUBLE_CODE,
  DOUBLE_SESSION_TOKEN,
  FIXED_NOW,
  createPortsDouble,
  doubleMember,
  type PortsDouble,
} from '../../../test/identity-double';

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

/** The cookie jar the actions read and write; one per test via `beforeEach`. */
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

/** The ports the actions receive, swapped per test. */
const holder = vi.hoisted(() => ({ ports: null as IdentityPorts | null }));
vi.mock('../../../lib/session/deps', () => ({
  getSignInDependencies: async () => holder.ports as IdentityPorts,
}));

import {
  completeSignInAction,
  resendSignInCodeAction,
  requestSignInCodeAction,
  useDifferentNumberAction,
} from './actions';
import { signOutAction } from '../../../lib/session/actions';

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

/** The identity double with the challenge port composed, as the sign-in actions receive it. */
function signInDouble(
  options: Parameters<typeof createPortsDouble>[0] = {},
): PortsDouble & { challengeRows: ReturnType<typeof challengePort>['rows'] } {
  const base = createPortsDouble(options);
  const challenge = challengePort();
  const ports: IdentityPorts = {
    ...base.ports,
    // The double's own member read answers `null` for every id — the registration flow never
    // reaches it — but `completeSignIn` reads the chosen account through it before it opens the
    // session (`C-006`), so this slice answers from the double's own rows.
    members: {
      ...base.ports.members,
      get: async (memberId: string) => base.members.find((row) => row.id === memberId) ?? null,
    },
    // The identity double refuses this port; the sign-in slice composes the real one.
    signInChallenges: challenge.port,
  };
  holder.ports = ports;
  return { ...base, ports, challengeRows: challenge.rows };
}

/** A member session read that answers from the double's own session map. */
function withReadableSessions(double: PortsDouble): PortsDouble {
  const read = async (token: string) => {
    const memberId = double.sessions.get(token);
    return memberId === undefined
      ? null
      : {
          sessionId: token,
          memberId,
          // An hour out: the double's clock sits at `FIXED_NOW`, and the read treats an expiry
          // equal to now as already past (`isPast`, `C-007`).
          expiresAt: '2026-11-18T10:00:00Z',
          absoluteExpiresAt: '2026-11-18T10:00:00Z',
          lastSeenAt: FIXED_NOW,
        };
  };
  holder.ports = { ...double.ports, memberSessions: { ...double.ports.memberSessions, read } };
  return double;
}

/** Runs an action and captures its redirect. */
async function run(
  action: (formData: FormData) => void | Promise<void>,
  formData?: FormData,
): Promise<Redirected> {
  try {
    await action(formData ?? new FormData());
    throw new Error('the action was expected to redirect');
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

/** A number form, overridable per test. */
function numberForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('telephoneNumber', '+2348031234567');
  for (const [key, value] of Object.entries(overrides)) {
    if (value === '') form.delete(key);
    else form.set(key, value);
  }
  return form;
}

/** A code form, overridable per test. */
function codeForm(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('code', DOUBLE_CODE);
  for (const [key, value] of Object.entries(overrides)) {
    if (value === '') form.delete(key);
    else form.set(key, value);
  }
  return form;
}

/** Reads one flow cookie as the state it holds. */
function flowCookie<T>(name: string): T | null {
  const raw = jar.get(name);
  return raw === undefined || raw === '' ? null : (JSON.parse(raw) as T);
}

/** Starts a flow through the real number action, then opens the code for its challenge. */
async function startCodeStep(
  double: PortsDouble,
  overrides: Record<string, string> = {},
): Promise<string> {
  await run(requestSignInCodeAction, numberForm(overrides));
  const pending = flowCookie<{ challengeId: string; telephoneNumber: string }>(
    'odp_signin_pending',
  );
  expect(pending).not.toBeNull();
  const challengeId = (pending as { challengeId: string }).challengeId;
  double.codes.set(challengeId, { code: DOUBLE_CODE, attempts: 0 });
  return challengeId;
}

describe('requestSignInCodeAction (C-005)', () => {
  beforeEach(() => {
    jar.clear();
  });

  it('sends a code and moves to the code step (Code sent; EVT-002)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });

    const redirect = await run(requestSignInCodeAction, numberForm());

    expect(redirect.url).toBe('/sign-in');
    const pending = flowCookie<{
      challengeId: string;
      telephoneNumber: string;
      returnTo: string;
      resendAvailableAt: string;
      rateLimit?: object;
    }>('odp_signin_pending');
    expect(pending?.challengeId).toMatch(/^sic_[0-9A-Z]+$/);
    expect(pending?.telephoneNumber).toBe('+2348031234567');
    expect(pending?.returnTo).toBe('/');
    expect(pending?.resendAvailableAt).toBeTruthy();
    // `C-001`/`NFR-027`: the action's answer carries the limiter's triple. A server action has no
    // response-header channel in Next.js, so the flow state is the answer that carries it.
    expect(pending?.rateLimit).toEqual({
      limit: 5,
      remaining: 4,
      resetSeconds: Date.parse(FIXED_NOW) / 1000,
    });
    // `C-005`: no account count and no account list travel with the challenge.
    expect(pending).not.toHaveProperty('accountCount');
    expect(pending).not.toHaveProperty('accountChoiceRequired');
    expect(flowCookie('odp_signin_retry')).toBeNull();
    expect(double.events.map((event) => event.name)).toContain('sign_in_started');
  });

  it('normalises a leading-zero number before the challenge is created (edge case)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });

    await run(requestSignInCodeAction, numberForm({ telephoneNumber: '08031234567' }));

    const pending = flowCookie<{ telephoneNumber: string }>('odp_signin_pending');
    expect(pending?.telephoneNumber).toBe('+2348031234567');
    expect(double.challengeRows.size).toBe(1);
  });

  it('names the failing field and keeps the typed number (Validation error)', async () => {
    signInDouble();

    const redirect = await run(requestSignInCodeAction, numberForm({ telephoneNumber: '12345' }));

    expect(redirect.url).toBe('/sign-in');
    const retry = flowCookie<{
      values: { telephoneNumber: string };
      fields: Record<string, string>;
    }>('odp_signin_retry');
    expect(retry?.fields['telephoneNumber']).toBe('PATTERN_MISMATCH');
    expect(retry?.values.telephoneNumber).toBe('12345');
    expect(flowCookie('odp_signin_pending')).toBeNull();
  });

  it('sends an unknown number to registration without losing it (NO_ACCOUNT_FOR_NUMBER)', async () => {
    signInDouble(); // No members: the number belongs to no account.

    const redirect = await run(requestSignInCodeAction, numberForm());

    expect(redirect.url).toBe('/join');
    const joinRetry = flowCookie<{ values: { telephoneNumber: string } }>('odp_join_retry');
    expect(joinRetry?.values.telephoneNumber).toBe('+2348031234567');
    expect(flowCookie('odp_signin_pending')).toBeNull();
  });

  it('states the wait when the number is rate limited (Rate limited)', async () => {
    signInDouble({ rateLimitRetryAfterSeconds: 45 });

    const redirect = await run(requestSignInCodeAction, numberForm());

    expect(redirect.url).toBe('/sign-in');
    const retry = flowCookie<{ status: string; retryAfterSeconds: number; rateLimit?: object }>(
      'odp_signin_retry',
    );
    expect(retry?.status).toBe('RATE_LIMITED');
    expect(retry?.retryAfterSeconds).toBe(45);
    // `C-001`: the refusal's answer carries the headers' own values beside the wait.
    expect(retry?.rateLimit).toEqual({
      limit: 5,
      remaining: 0,
      resetSeconds: Date.parse(FIXED_NOW) / 1000,
      retryAfterSeconds: 45,
    });
    expect(flowCookie('odp_signin_pending')).toBeNull();
  });

  it('states the failure when the code could not be sent (Delivery failed)', async () => {
    signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
      smsUnavailable: true,
    });

    const redirect = await run(requestSignInCodeAction, numberForm());

    expect(redirect.url).toBe('/sign-in');
    const retry = flowCookie<{ status: string }>('odp_signin_retry');
    expect(retry?.status).toBe('DELIVERY_FAILED');
    expect(flowCookie('odp_signin_pending')).toBeNull();
  });
});

describe('completeSignInAction (C-006)', () => {
  beforeEach(() => {
    jar.clear();
  });

  it('opens the session and returns the member where they came from', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    await startCodeStep(double, { returnTo: '/s/ODP-004821' });

    const redirect = await run(completeSignInAction, codeForm());

    expect(redirect.url).toBe('/s/ODP-004821');
    expect(jar.get('odp_session')).toBe(DOUBLE_SESSION_TOKEN);
    expect(flowCookie('odp_signin_pending')).toBeNull();
    expect(double.sessions.get(DOUBLE_SESSION_TOKEN)).toBe('mbr_0001');
    expect(double.audit.map((event) => event.action)).toContain('member.signed_in');
  });

  it('opens the session for the account that holds the number, with no account choice (C-006)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    const challengeId = await startCodeStep(double);
    const pending = flowCookie<Record<string, unknown>>('odp_signin_pending');
    expect(pending).not.toHaveProperty('accountChoiceRequired');
    expect(pending).not.toHaveProperty('accountCount');

    // A posted member reference is ignored: the challenge already resolves the one account.
    const redirect = await run(completeSignInAction, codeForm({ memberId: 'mbr_9999' }));

    expect(redirect.url).toBe('/');
    expect(double.sessions.get(DOUBLE_SESSION_TOKEN)).toBe('mbr_0001');
    const signedIn = double.audit.find((event) => event.action === 'member.signed_in');
    expect(signedIn?.entityId).toBe('mbr_0001');
    expect(double.challengeRows.get(challengeId)?.consumedAt).toBeDefined();
  });

  it('states the tries remaining after a wrong code (Incorrect code)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    await startCodeStep(double);

    const redirect = await run(completeSignInAction, codeForm({ code: '000000' }));

    expect(redirect.url).toBe('/sign-in');
    const status = flowCookie<{ cause: string; attemptsRemaining: number }>('odp_signin_status');
    expect(status?.cause).toBe('CODE_INCORRECT');
    expect(status?.attemptsRemaining).toBe(2);
    expect(double.sessions.size).toBe(0);
  });

  it('accepts a pasted code that carries spaces (edge case)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    await startCodeStep(double);

    const redirect = await run(completeSignInAction, codeForm({ code: '418 302' }));

    expect(redirect.url).toBe('/');
    expect(double.sessions.size).toBe(1);
  });

  it('renders the expired state when the window has closed (Expired)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    const challengeId = await startCodeStep(double);
    double.challengeRows.set(challengeId, {
      ...double.challengeRows.get(challengeId)!,
      expiresAt: '2026-11-18T08:00:00Z',
    });

    const redirect = await run(completeSignInAction, codeForm());

    expect(redirect.url).toBe('/sign-in');
    const status = flowCookie<{ cause: string }>('odp_signin_status');
    expect(status?.cause).toBe('CODE_EXPIRED');
    expect(double.sessions.size).toBe(0);
  });

  it('sends a browser with no flow back to the number step', async () => {
    signInDouble();

    const redirect = await run(completeSignInAction, codeForm());

    expect(redirect.url).toBe('/sign-in');
  });
});

describe('resendSignInCodeAction (C-005)', () => {
  beforeEach(() => {
    jar.clear();
  });

  it('issues a fresh code and moves the pointer to it (Code step resend)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    const first = await startCodeStep(double);

    const redirect = await run(resendSignInCodeAction);

    expect(redirect.url).toBe('/sign-in');
    const pending = flowCookie<{ challengeId: string; telephoneNumber: string }>(
      'odp_signin_pending',
    );
    expect(pending?.challengeId).not.toBe(first);
    expect(pending?.telephoneNumber).toBe('+2348031234567');
    expect(flowCookie('odp_signin_status')).toBeNull();
  });

  it('states the wait when the resend is refused (Rate limited)', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    await startCodeStep(double);

    // A second bundle whose limiter refuses: the resend consults the per-number bucket.
    const limited = createPortsDouble({ rateLimitRetryAfterSeconds: 45 });
    holder.ports = {
      ...limited.ports,
      signInChallenges: (holder.ports as IdentityPorts).signInChallenges,
    };

    const redirect = await run(resendSignInCodeAction);

    expect(redirect.url).toBe('/sign-in');
    const status = flowCookie<{ cause: string; retryAfterSeconds: number }>('odp_signin_status');
    expect(status?.cause).toBe('RATE_LIMITED');
    expect(status?.retryAfterSeconds).toBe(45);
  });
});

describe('useDifferentNumberAction (screens/02 Use a different number)', () => {
  beforeEach(() => {
    jar.clear();
  });

  it('clears the pointer and returns to the number step', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    await startCodeStep(double);
    expect(flowCookie('odp_signin_pending')).not.toBeNull();

    const redirect = await run(useDifferentNumberAction);

    expect(redirect.url).toBe('/sign-in');
    expect(flowCookie('odp_signin_pending')).toBeNull();
  });
});

describe('signOutAction (C-008)', () => {
  beforeEach(() => {
    jar.clear();
  });

  it('ends the session and clears the cookie with the 204 answer', async () => {
    const double = withReadableSessions(
      signInDouble({
        members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
      }),
    );
    double.sessions.set(DOUBLE_SESSION_TOKEN, 'mbr_0001');
    jar.set('odp_session', DOUBLE_SESSION_TOKEN);

    const redirect = await run(signOutAction);

    expect(redirect.url).toBe('/');
    expect(jar.get('odp_session')).toBe('');
    expect(double.audit.map((event) => event.action)).toContain('member.signed_out');
  });

  it('answers signed out when no cookie is presented', async () => {
    const double = signInDouble();

    const redirect = await run(signOutAction);

    expect(redirect.url).toBe('/');
    expect(jar.has('odp_session')).toBe(false);
    expect(double.audit).toHaveLength(0);
  });

  it('leaves the cookie in place when the session store cannot answer', async () => {
    const double = signInDouble({
      members: [doubleMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    double.sessions.set(DOUBLE_SESSION_TOKEN, 'mbr_0001');
    jar.set('odp_session', DOUBLE_SESSION_TOKEN);
    holder.ports = {
      ...double.ports,
      memberSessions: {
        ...double.ports.memberSessions,
        read: async () => {
          throw new Error('the session store is unreachable');
        },
      },
    };

    const redirect = await run(signOutAction);

    expect(redirect.url).toBe('/');
    expect(jar.get('odp_session')).toBe(DOUBLE_SESSION_TOKEN);
  });
});
