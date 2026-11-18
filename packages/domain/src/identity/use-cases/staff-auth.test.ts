/**
 * Staff authentication tests (`C-092`, `NFR-020`, `NFR-021`, `NFR-026`, `NFR-028`).
 *
 * The password step alone authorises nothing; the second factor is required, the lockout is fixed at
 * five failures, a recovery code is single-use, enrolment is one-time, and every state change is
 * audited.
 */
import { describe, expect, it } from 'vitest';
import {
  beginStaffSignIn,
  enrolStaffSecondFactor,
  readStaffSession,
  signOutStaff,
  verifyStaffSecondFactor,
} from '../index.ts';
import {
  FAKE_NOW,
  FAKE_PASSWORD,
  FAKE_RATE_LIMIT,
  FAKE_TOTP_CODE,
  createIdentityHarness,
  fakeStaffCredential,
  fakeStaffUser,
} from '../fakes.ts';
import type { IdentityCaller } from '../entities.ts';

const publicCaller = { kind: 'public' as const, locale: 'en-NG' as const };

const staffHarness = (options: Parameters<typeof createIdentityHarness>[0] = {}) =>
  createIdentityHarness({
    staff: [fakeStaffUser({ id: 'stf_0001', secondFactorEnrolled: true })],
    credentials: [
      fakeStaffCredential({ id: 'cred_0001', staffUserId: 'stf_0001', username: 'a.balogun' }),
    ],
    ...options,
  });

/** Begins a sign-in and builds the caller context the web layer would resolve from the session. */
async function signIn(
  fakes: ReturnType<typeof createIdentityHarness>,
  key = 'key-begin',
): Promise<IdentityCaller> {
  await beginStaffSignIn(publicCaller, fakes.ports, {
    username: 'a.balogun',
    password: FAKE_PASSWORD,
    idempotencyKey: key,
  });
  const sessionId = [...fakes.staffSessions.keys()][0] ?? '';
  const session = fakes.staffSessions.get(sessionId);
  return {
    kind: 'staff',
    staffId: 'stf_0001',
    role: 'response_staff',
    external: false,
    authorisedWardIds: [],
    secondFactorSatisfied: session?.secondFactorSatisfied ?? false,
    secondFactorEnrolled: true,
    sessionId,
    sessionStartedAt: session?.startedAt ?? FAKE_NOW,
    sessionExpiresAt: session?.expiresAt ?? '2026-11-18T09:10:00Z',
    locale: 'en-NG',
  };
}

describe('beginStaffSignIn (C-092)', () => {
  it('opens a challenge session and authorises nothing else', async () => {
    const fakes = staffHarness();
    const result = await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-1',
    });
    expect(result).toEqual({
      ok: true,
      session: {
        established: true,
        secondFactorSatisfied: false,
        expiresAt: '2026-11-18T09:10:00Z',
        absoluteExpiresAt: '2026-11-18T09:10:00Z',
      },
      secondFactorEnrolled: true,
      nextScreen: '/admin/verify',
      // `C-001` puts the limiter's cap, remainder and reset on the response, so the answer carries them
      // and the transport prints `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset`.
      rateLimit: {
        limit: FAKE_RATE_LIMIT,
        remaining: FAKE_RATE_LIMIT - 1,
        resetSeconds: Math.ceil(Date.parse('2026-11-18T09:01:00Z') / 1000),
      },
    });
    expect(fakes.audit.map((event) => event.action)).toEqual(['staff.sign_in_started']);
    expect(fakes.idempotency.has('key-1')).toBe(true);
  });

  it('replays a key without a second session or audit entry', async () => {
    const fakes = staffHarness();
    const first = await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-1',
    });
    const replay = await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-1',
    });
    if (!first.ok || !replay.ok) throw new Error('both calls must open a challenge');
    // The replay returns the recorded answer, and transport material is never part of it: a second
    // presentation of the token would be a second way into one session, and the first call's header
    // values would describe a window this request did not consume.
    expect(replay.cookie).toBeUndefined();
    expect(replay.rateLimit).toBeUndefined();
    const recorded: Record<string, unknown> = { ...first };
    delete recorded['cookie'];
    delete recorded['rateLimit'];
    expect(replay).toEqual(recorded);
    expect(fakes.staffSessions.size).toBe(1);
    expect(fakes.audit).toHaveLength(1);
  });

  it('answers an unknown username and a wrong password identically', async () => {
    const fakes = staffHarness();
    const unknown = await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'not.a.user',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-1',
    });
    const wrong = await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'a.balogun',
      password: 'a-wrong-password-2026',
      idempotencyKey: 'key-2',
    });
    expect(unknown).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'STAFF_CREDENTIALS_INVALID',
    });
    expect(wrong).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'STAFF_CREDENTIALS_INVALID',
    });
  });

  it('locks the credential after five failures', async () => {
    const fakes = staffHarness();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const result = await beginStaffSignIn(publicCaller, fakes.ports, {
        username: 'a.balogun',
        password: 'a-wrong-password-2026',
        idempotencyKey: `key-${attempt}`,
      });
      if (attempt < 5) {
        expect(result).toMatchObject({ ok: false, cause: 'STAFF_CREDENTIALS_INVALID' });
      } else {
        expect(result).toMatchObject({
          ok: false,
          code: 'RATE_LIMITED',
          cause: 'ACCOUNT_LOCKED',
          retryAfterSeconds: 1800,
        });
      }
    }
    const locked = await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-6',
    });
    expect(locked).toMatchObject({ ok: false, code: 'RATE_LIMITED', cause: 'ACCOUNT_LOCKED' });
  });

  it('refuses an inactive account even with the right password', async () => {
    const fakes = staffHarness({
      staff: [fakeStaffUser({ id: 'stf_0001', active: false })],
    });
    const result = await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-1',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'FORBIDDEN_ROLE',
      cause: 'STAFF_INACTIVE',
    });
  });
});

describe('verifyStaffSecondFactor (C-092)', () => {
  it('satisfies the session with a code and audits the sign-in', async () => {
    const fakes = staffHarness();
    const caller = await signIn(fakes);
    const result = await verifyStaffSecondFactor(caller, fakes.ports, {
      code: FAKE_TOTP_CODE,
      idempotencyKey: 'key-verify',
    });
    expect(result).toMatchObject({
      ok: true,
      staff: { id: 'stf_0001', secondFactorSatisfied: true, secondFactorEnrolled: true },
      session: {
        expiresAt: '2026-11-18T09:30:00Z',
        absoluteExpiresAt: '2026-11-18T17:00:00Z',
      },
      nextScreen: '/admin',
    });
    expect(
      fakes.staffSessions.get(caller.kind === 'staff' ? caller.sessionId : '')
        ?.secondFactorSatisfied,
    ).toBe(true);
    expect(fakes.audit.map((event) => event.action)).toContain('staff.signed_in');
  });

  it('refuses a wrong code and states nothing about the password', async () => {
    const fakes = staffHarness();
    const caller = await signIn(fakes);
    const result = await verifyStaffSecondFactor(caller, fakes.ports, {
      code: '000000',
      idempotencyKey: 'key-verify',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'SECOND_FACTOR_INCORRECT',
    });
    expect(fakes.audit.map((event) => event.action)).toContain('staff.sign_in_refused');
  });

  it('spends a recovery code once', async () => {
    const fakes = staffHarness();
    const caller = await signIn(fakes);
    const first = await verifyStaffSecondFactor(caller, fakes.ports, {
      recoveryCode: '5F2C-9A71-KM04-QD7V',
      idempotencyKey: 'key-recovery-1',
    });
    expect(first).toMatchObject({ ok: true, nextScreen: '/admin' });
    expect(fakes.audit.map((event) => event.action)).toEqual(
      expect.arrayContaining(['staff.signed_in', 'staff.recovery_code_used']),
    );

    const again = await verifyStaffSecondFactor(caller, fakes.ports, {
      recoveryCode: '5F2C-9A71-KM04-QD7V',
      idempotencyKey: 'key-recovery-2',
    });
    expect(again).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'RECOVERY_CODE_SPENT',
    });
  });

  it('refuses verification before enrolment and after the challenge expires', async () => {
    const unenrolled = staffHarness({
      staff: [fakeStaffUser({ id: 'stf_0001', secondFactorEnrolled: false })],
      credentials: [
        fakeStaffCredential({
          id: 'cred_0001',
          staffUserId: 'stf_0001',
          username: 'a.balogun',
          enrolledAt: undefined,
        }),
      ],
    });
    const unenrolledCaller = await signIn(unenrolled);
    const notEnrolled = await verifyStaffSecondFactor(unenrolledCaller, unenrolled.ports, {
      code: FAKE_TOTP_CODE,
      idempotencyKey: 'key-verify',
    });
    expect(notEnrolled).toMatchObject({
      ok: false,
      code: 'POLICY_VIOLATION',
      cause: 'SECOND_FACTOR_NOT_ENROLLED',
      meta: { recoveryPath: '/admin/enrol' },
    });

    const fakes = staffHarness();
    const caller = await signIn(fakes);
    const expired: IdentityCaller =
      caller.kind === 'staff' ? { ...caller, sessionExpiresAt: '2026-11-18T08:59:00Z' } : caller;
    const result = await verifyStaffSecondFactor(expired, fakes.ports, {
      code: FAKE_TOTP_CODE,
      idempotencyKey: 'key-verify',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'SECOND_FACTOR_CHALLENGE_EXPIRED',
    });
  });
});

describe('enrolStaffSecondFactor (C-092)', () => {
  const unenrolledHarness = () =>
    staffHarness({
      staff: [fakeStaffUser({ id: 'stf_0001', secondFactorEnrolled: false })],
      credentials: [
        fakeStaffCredential({
          id: 'cred_0001',
          staffUserId: 'stf_0001',
          username: 'a.balogun',
          enrolledAt: undefined,
        }),
      ],
    });

  it('issues the secret once, then enrols and returns ten recovery codes', async () => {
    const fakes = unenrolledHarness();
    const caller = await signIn(fakes);

    const begun = await enrolStaffSecondFactor(caller, fakes.ports, {
      action: 'begin',
      idempotencyKey: 'key-enrol-1',
    });
    expect(begun).toMatchObject({
      ok: true,
      action: 'begin',
      totp: { algorithm: 'SHA1', digits: 6, periodSeconds: 30 },
    });
    expect(JSON.stringify(begun)).toContain('otpauth://totp/');

    const confirmed = await enrolStaffSecondFactor(caller, fakes.ports, {
      action: 'confirm',
      code: FAKE_TOTP_CODE,
      idempotencyKey: 'key-enrol-2',
    });
    expect(confirmed).toMatchObject({
      ok: true,
      action: 'confirm',
      secondFactorEnrolled: true,
      secondFactorEnrolledAt: FAKE_NOW,
    });
    const codes = (confirmed as { recoveryCodes: readonly string[] }).recoveryCodes;
    expect(codes).toHaveLength(10);
    expect(fakes.staff[0]?.secondFactorEnrolled).toBe(true);
    expect(fakes.audit.map((event) => event.action)).toContain('staff.second_factor_enrolled');
  });

  it('refuses a second enrolment', async () => {
    const fakes = staffHarness();
    const caller = await signIn(fakes);
    const result = await enrolStaffSecondFactor(caller, fakes.ports, {
      action: 'begin',
      idempotencyKey: 'key-enrol',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'POLICY_VIOLATION',
      cause: 'SECOND_FACTOR_ALREADY_ENROLLED',
    });
  });
});

describe('readStaffSession and signOutStaff (C-092)', () => {
  it('renders signed out, the challenge and the satisfied session', async () => {
    const fakes = staffHarness();
    expect(await readStaffSession(fakes.ports, {})).toEqual({
      ok: true,
      signedIn: false,
      staff: null,
      session: null,
      nextScreen: '/admin/sign-in',
    });

    const caller = await signIn(fakes);
    const token = caller.kind === 'staff' ? caller.sessionId : '';
    const challenge = await readStaffSession(fakes.ports, { staffSessionToken: token });
    expect(challenge).toMatchObject({
      ok: true,
      signedIn: true,
      nextScreen: '/admin/verify',
      staff: { secondFactorSatisfied: false },
    });

    await verifyStaffSecondFactor(caller, fakes.ports, {
      code: FAKE_TOTP_CODE,
      idempotencyKey: 'key-verify',
    });
    const satisfied = await readStaffSession(fakes.ports, { staffSessionToken: token });
    expect(satisfied).toMatchObject({ ok: true, nextScreen: '/admin' });
  });

  it('ends the current staff session and audits once', async () => {
    const fakes = staffHarness();
    const caller = await signIn(fakes);
    const result = await signOutStaff(caller, fakes.ports, {
      scope: 'current',
      idempotencyKey: 'key-out',
    });
    expect(result).toEqual({ ok: true });
    expect(fakes.endedSessionIds.has(caller.kind === 'staff' ? caller.sessionId : '')).toBe(true);
    expect(fakes.audit.map((event) => event.action)).toContain('staff.signed_out');
  });
});
