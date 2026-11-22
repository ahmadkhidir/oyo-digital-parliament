/**
 * Session issuance, renewal and clearing across the identity use cases (`C-003`, `C-006` to `C-008`,
 * `C-092`, `NFR-026`, `NFR-027`).
 *
 * P1-03 found that a session was written and its token never reached the caller. These cases pin the
 * fix: every use case that opens, renews or ends a session answers with the cookie the transport must
 * set, the cookie's lifetime never outlives the session behind it, and the token itself stays out of
 * every projection the response body is built from.
 *
 * The harness issues `ses_member_1`-shaped handles, which no browser may carry. Each case therefore
 * wraps the session ports with the opaque token the production adapter issues, which is also what makes
 * the cookie's value assertable here.
 */
import { describe, expect, it } from 'vitest';

import {
  beginStaffSignIn,
  completeSignIn,
  confirmRegistration,
  enrolStaffSecondFactor,
  readSession,
  readStaffSession,
  requestSignInCode,
  verifyStaffSecondFactor,
} from '../index.ts';
import {
  FAKE_CODE,
  FAKE_NOW,
  FAKE_PASSWORD,
  FAKE_TOTP_CODE,
  createIdentityHarness,
  fakeMember,
  fakeStaffCredential,
  fakeStaffUser,
} from '../fakes.ts';
import type { IdentityCaller, PendingRegistration } from '../entities.ts';
import type { IdentityPorts } from '../ports.ts';
import {
  liveSessionCookie,
  rateLimitHeaders,
  renderRateLimitHeaders,
  type RateLimitOutcome,
} from '../../ports/session.ts';

const publicCaller = { kind: 'public' as const, locale: 'en-NG' as const };

/** The limiter's full answer, as the adapter reports it, with one field varied per case. */
function limiterAnswer(overrides: Partial<RateLimitOutcome> = {}): RateLimitOutcome {
  return {
    allowed: true,
    retryAfterSeconds: 0,
    limit: 30,
    remaining: 29,
    resetAt: '2026-11-18T09:15:00Z',
    ...overrides,
  };
}

/** A token in the shape the session adapter issues: 32 random bytes, base64url, 43 characters. */
const tokenFor = (sequence: number): string => `${'A'.repeat(42)}${(sequence % 36).toString(36)}`;

/** The pending registration `C-003` reads, with the 24-hour window `C-002` prints. */
function pendingRow(overrides: Partial<PendingRegistration> = {}): PendingRegistration {
  return {
    id: 'prg_0001',
    telephoneNumber: '+2348031234567',
    fullName: 'Oluwaseun Adeyemi',
    displayName: 'Seun A.',
    declaredAge: 24,
    locale: 'en-NG',
    codeSentAt: FAKE_NOW,
    expiresAt: '2026-11-19T09:00:00Z',
    createdAt: FAKE_NOW,
    ...overrides,
  };
}

/** One limiter answer that reports all three `C-001` header values. */
const RATE_LIMIT_ANSWER = {
  allowed: true,
  retryAfterSeconds: 0,
  limit: 30,
  remaining: 27,
  resetAt: '2026-11-18T09:15:00Z',
} as const;

/**
 * Wrap the harness's session and limiter ports.
 *
 * The session ports answer with an opaque token, as the production adapter does, and remember which
 * handle it belongs to. The limiter reports the header triple when the case asks for it.
 */
function opaquePorts(
  fakes: ReturnType<typeof createIdentityHarness>,
  options: { readonly rateLimitTriple?: boolean } = {},
): {
  readonly ports: IdentityPorts;
  readonly tokens: { readonly member: string[]; readonly staff: string[] };
} {
  const tokens = { member: [] as string[], staff: [] as string[] };
  const handles = new Map<string, string>();
  let sequence = 0;
  const nextToken = (namespace: 'member' | 'staff'): string => {
    sequence += 1;
    const token = tokenFor(sequence);
    tokens[namespace].push(token);
    return token;
  };
  const handleFor = (token: string): string => handles.get(token) ?? token;

  const memberSessions = fakes.ports.memberSessions;
  const staffSessions = fakes.ports.staffSessions;

  const ports: IdentityPorts = {
    ...fakes.ports,
    memberSessions: {
      async create(input) {
        const { sessionId } = await memberSessions.create(input);
        const token = nextToken('member');
        handles.set(token, sessionId);
        return { sessionId: token };
      },
      read: (token) => memberSessions.read(handleFor(token)),
      end: (sessionId) => memberSessions.end(handleFor(sessionId)),
    },
    staffSessions: {
      async create(input) {
        const { sessionId } = await staffSessions.create(input);
        const token = nextToken('staff');
        handles.set(token, sessionId);
        return { sessionId: token };
      },
      read: (token) => staffSessions.read(handleFor(token)),
      upgrade: (sessionId, input) => staffSessions.upgrade(handleFor(sessionId), input),
      end: (sessionId) => staffSessions.end(handleFor(sessionId)),
      endAllForStaff: (staffId) => staffSessions.endAllForStaff(staffId),
    },
    rateLimits: {
      async consume(input) {
        return options.rateLimitTriple === true
          ? { ...RATE_LIMIT_ANSWER }
          : fakes.ports.rateLimits.consume(input);
      },
    },
  };

  return { ports, tokens };
}

/** A staff harness: one enrolled account with the password every fake accepts. */
function staffHarness(enrolled = true) {
  return createIdentityHarness({
    staff: [fakeStaffUser({ id: 'stf_0001', secondFactorEnrolled: enrolled })],
    credentials: [
      fakeStaffCredential({
        id: 'cred_0001',
        staffUserId: 'stf_0001',
        username: 'a.balogun',
        ...(enrolled ? {} : { enrolledAt: undefined }),
      }),
    ],
  });
}

/** The caller the web layer resolves from the cookie the password step answered with. */
function staffCaller(sessionId: string): IdentityCaller {
  return {
    kind: 'staff',
    staffId: 'stf_0001',
    role: 'response_staff',
    external: false,
    authorisedWardIds: [],
    secondFactorSatisfied: false,
    secondFactorEnrolled: true,
    sessionId,
    sessionStartedAt: FAKE_NOW,
    sessionExpiresAt: '2026-11-18T09:10:00Z',
    locale: 'en-NG',
  };
}

describe('member session issuance (C-003, C-006)', () => {
  it('answers the registration confirmation with the session cookie and no token in the body', async () => {
    const fakes = createIdentityHarness({ pending: [pendingRow()] });
    fakes.codes.set('prg_0001', { code: FAKE_CODE, attempts: 0 });
    const { ports, tokens } = opaquePorts(fakes);

    const result = await confirmRegistration(publicCaller, ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const token = tokens.member[0] ?? '';
    expect(result.cookie?.name).toBe('odp_session');
    expect(result.cookie?.value).toBe(token);
    expect(result.cookie?.header).toContain('HttpOnly');
    expect(result.cookie?.header).toContain('Secure');
    expect(result.cookie?.header).toContain('SameSite=Lax');
    // `C-003` prints a twelve-hour window: the cookie lives exactly that long, not one second more.
    expect(result.cookie?.header).toContain('Max-Age=43200');
    // The projection the body is built from carries no session material.
    expect(JSON.stringify({ member: result.member, session: result.session })).not.toContain(token);
  });

  it('answers a completed sign-in with the session cookie', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    const { ports, tokens } = opaquePorts(fakes);

    const requested = await requestSignInCode(publicCaller, ports, {
      telephoneNumber: '+2348031234567',
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    fakes.codes.set(requested.signInChallengeId, { code: FAKE_CODE, attempts: 0 });

    const result = await completeSignIn(publicCaller, ports, {
      signInChallengeId: requested.signInChallengeId,
      code: FAKE_CODE,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cookie?.name).toBe('odp_session');
    expect(result.cookie?.value).toBe(tokens.member[0]);
    expect(result.cookie?.header).toContain('Max-Age=43200');
    expect(JSON.stringify(result.member)).not.toContain(tokens.member[0] ?? '');
  });
});

describe('staff session issuance (C-092)', () => {
  it('answers the password step with a ten-minute staff cookie and the C-001 headers', async () => {
    const fakes = staffHarness();
    const { ports, tokens } = opaquePorts(fakes, { rateLimitTriple: true });

    const result = await beginStaffSignIn(publicCaller, ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-begin',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cookie?.name).toBe('odp_staff_session');
    expect(result.cookie?.value).toBe(tokens.staff[0]);
    // The challenge is ten minutes, idle and absolute at once.
    expect(result.cookie?.header).toContain('Max-Age=600');
    expect(result.rateLimit).toEqual({
      limit: 30,
      remaining: 27,
      resetSeconds: Math.ceil(Date.parse('2026-11-18T09:15:00Z') / 1000),
    });
    expect(renderRateLimitHeaders(result.rateLimit!)).toEqual({
      'RateLimit-Limit': '30',
      'RateLimit-Remaining': '27',
      'RateLimit-Reset': String(Math.ceil(Date.parse('2026-11-18T09:15:00Z') / 1000)),
    });
  });

  it('re-presents the staff cookie with the satisfied window after the second factor', async () => {
    const fakes = staffHarness();
    const { ports, tokens } = opaquePorts(fakes);
    const begun = await beginStaffSignIn(publicCaller, ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-begin',
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    const result = await verifyStaffSecondFactor(staffCaller(tokens.staff[0] ?? ''), ports, {
      code: FAKE_TOTP_CODE,
      idempotencyKey: 'key-verify',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cookie?.name).toBe('odp_staff_session');
    // Thirty minutes idle, renewed by each authorised request: 09:10 plus thirty minutes, not ten.
    expect(result.cookie?.header).toContain('Max-Age=1800');
  });

  it('re-presents the staff cookie when enrolment completes the sign-in', async () => {
    const fakes = staffHarness(false);
    const { ports, tokens } = opaquePorts(fakes);
    const begun = await beginStaffSignIn(publicCaller, ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-begin',
    });
    expect(begun.ok).toBe(true);
    if (!begun.ok) return;

    const result = await enrolStaffSecondFactor(staffCaller(tokens.staff[0] ?? ''), ports, {
      action: 'confirm',
      code: FAKE_TOTP_CODE,
      idempotencyKey: 'key-enrol',
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== 'confirm') return;
    expect(result.cookie?.header).toContain('Max-Age=1800');
  });

  it('keeps the token out of the recorded replay answer', async () => {
    const fakes = staffHarness();
    const { ports } = opaquePorts(fakes);
    await beginStaffSignIn(publicCaller, ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-begin',
    });

    // `C-092` replays the recorded answer. It must not carry a session token: the session store keeps a
    // digest, and a second copy in the replay store would make the token readable there.
    const recorded = JSON.stringify([...fakes.idempotency.values()]);
    expect(recorded).not.toContain('A'.repeat(40));
  });
});

describe('session read and expiry (C-007, C-092)', () => {
  it('renews the member cookie the read resolved', async () => {
    const fakes = createIdentityHarness({ pending: [pendingRow()] });
    fakes.codes.set('prg_0001', { code: FAKE_CODE, attempts: 0 });
    const { ports, tokens } = opaquePorts(fakes);
    await confirmRegistration(publicCaller, ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });

    const result = await readSession(ports, { memberSessionToken: tokens.member[0] ?? '' });

    expect(result.ok).toBe(true);
    if (!result.ok || !result.signedIn) return;
    expect(result.cookie?.name).toBe('odp_session');
    expect(result.cookie?.value).toBe(tokens.member[0]);
    expect(result.cookie?.header).toContain('Max-Age=43200');
  });

  it('clears a member token that names no live session', async () => {
    const fakes = createIdentityHarness();
    const { ports } = opaquePorts(fakes);

    const result = await readSession(ports, { memberSessionToken: tokenFor(9) });

    expect(result).toMatchObject({ ok: true, signedIn: false, member: null, staff: null });
    expect(result.ok && 'cookie' in result ? result.cookie?.header : undefined).toBe(
      'odp_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0',
    );
  });

  it('renews the staff cookie and clears one past its timeout', async () => {
    const fakes = staffHarness();
    const { ports, tokens } = opaquePorts(fakes);
    await beginStaffSignIn(publicCaller, ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-begin',
    });
    const token = tokens.staff[0] ?? '';

    const live = await readStaffSession(ports, { staffSessionToken: token });
    expect(live).toMatchObject({ ok: true, signedIn: true, nextScreen: '/admin/verify' });
    expect(live.ok && live.signedIn ? live.cookie?.header : '').toContain('Max-Age=600');

    const stale = await readStaffSession(ports, { staffSessionToken: tokenFor(8) });
    expect(stale).toMatchObject({ ok: true, signedIn: false, nextScreen: '/admin/sign-in' });
    expect(stale.ok && 'cookie' in stale ? stale.cookie?.header : '').toContain('Max-Age=0');
  });
});

describe('the cookie and header builders (NFR-026, C-001)', () => {
  const TOKEN = 'test-token-not-a-secret-0123456789abcdef012';

  it('presents nothing once the window has closed', () => {
    expect(
      liveSessionCookie({
        namespace: 'member',
        token: TOKEN,
        expiresAt: '2026-11-18T08:00:00Z',
        absoluteExpiresAt: '2026-11-18T21:00:00Z',
        now: FAKE_NOW,
      }),
    ).toBeNull();
  });

  it('never lets a renewed idle window outlive the absolute one', () => {
    const cookie = liveSessionCookie({
      namespace: 'staff',
      token: TOKEN,
      expiresAt: '2026-11-18T21:00:00Z',
      absoluteExpiresAt: '2026-11-18T09:30:00Z',
      now: FAKE_NOW,
    });

    expect(cookie?.header).toContain('Max-Age=1800');
  });

  it('presents nothing for a value a browser may not carry', () => {
    expect(
      liveSessionCookie({
        namespace: 'member',
        token: 'ses_member_1',
        expiresAt: '2026-11-18T21:00:00Z',
        now: FAKE_NOW,
      }),
    ).toBeNull();
  });

  it('reports no headers when the limiter answers with only its decision', () => {
    expect(rateLimitHeaders({ allowed: true, retryAfterSeconds: 0 })).toBeNull();
  });

  it('refuses a malformed header triple rather than emitting it', () => {
    expect(rateLimitHeaders(limiterAnswer({ allowed: false, limit: -1, remaining: 0 }))).toBeNull();
    expect(rateLimitHeaders(limiterAnswer({ resetAt: 'not-an-instant' }))).toBeNull();
  });

  it('renders the refusal wait beside the triple', () => {
    const headers = rateLimitHeaders(
      limiterAnswer({ allowed: false, retryAfterSeconds: 30, limit: 3, remaining: 0 }),
    );

    expect(headers?.retryAfterSeconds).toBe(30);
    expect(renderRateLimitHeaders(headers!)).toMatchObject({ 'Retry-After': '30' });
  });
});
