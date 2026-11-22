/**
 * The refusals a code check used to conflate, and the header values a refusal owes `C-001`
 * (`C-001`, `C-003`, `C-004`, `C-005`, `C-006`, `NFR-027`).
 *
 * A comparison that answered true or false reported a closed code window as one more wrong guess, so a
 * resident who typed a stale code spent an attempt and was never told to ask for a new one. These cases
 * pin the three answers apart: a live code guessed wrong is `CODE_INCORRECT` with the remainder, a code
 * that is gone while the flow is still live is `CODE_EXPIRED` and costs no attempt, and a store that
 * cannot answer is `SERVICE_DEGRADED` rather than a guess either way.
 *
 * They also pin what a limiter-driven refusal carries: the cap, the remainder and the reset instant are
 * on the refusal itself, so the action layer prints `RateLimit-Limit`, `RateLimit-Remaining`,
 * `RateLimit-Reset` and `Retry-After` from one answer instead of consulting the limiter twice.
 */
import { describe, expect, it } from 'vitest';

import {
  completeSignIn,
  confirmRegistration,
  requestSignInCode,
  resendRegistrationCode,
} from '../index.ts';
import {
  FAKE_CODE,
  FAKE_NOW,
  FAKE_RATE_LIMIT,
  createIdentityHarness,
  fakeMember,
} from '../fakes.ts';
import type { PendingRegistration } from '../entities.ts';
import { renderRateLimitHeaders } from '../../ports/session.ts';

const publicCaller = { kind: 'public' as const, locale: 'en-NG' as const };

/** The instant the fake limiter's window resets, as the `C-001` header prints it. */
const FAKE_RESET_SECONDS = Math.ceil(Date.parse('2026-11-18T09:01:00Z') / 1000);

/** The pending registration `C-003` reads: live for twenty-four hours from `C-002`. */
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

/** A registration harness holding one pending row and no issued code. */
function registrationHarness(options: Parameters<typeof createIdentityHarness>[0] = {}) {
  return createIdentityHarness({ pending: [pendingRow()], ...options });
}

describe('a code whose window has closed (C-003)', () => {
  it('answers CODE_EXPIRED rather than counting the digits as wrong', async () => {
    const fakes = registrationHarness();

    const result = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'CODE_EXPIRED',
      // The screen's Expired state leads with the resend, so the refusal names it.
      meta: { recoveryPath: '/join/confirm' },
    });
    if (result.ok) return;
    // An expiry is not a guess: no attempt is recorded, so the next correct code is judged on its own.
    expect(result.attemptsRemaining).toBeUndefined();
    expect(fakes.codes.get('prg_0001')).toBeUndefined();
  });

  it('answers CODE_INCORRECT, not CODE_EXPIRED, for the first wrong digits of a live code', async () => {
    const fakes = registrationHarness();
    fakes.codes.set('prg_0001', { code: FAKE_CODE, attempts: 0 });

    const result = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: '000000',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'CODE_INCORRECT',
      attemptsRemaining: 2,
    });
  });

  it('keeps a store that cannot answer apart from a closed window', async () => {
    const fakes = registrationHarness({ codeStoreUnavailable: true });

    const result = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'CODE_STORE_UNAVAILABLE',
    });
  });

  it('answers CODE_EXPIRED on a sign-in challenge whose code is gone', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    const requested = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    // The challenge was opened; its code is then gone, as it is once the ten-minute window closes.
    fakes.codes.set(requested.signInChallengeId, { code: '', attempts: 0 });

    const result = await completeSignIn(publicCaller, fakes.ports, {
      signInChallengeId: requested.signInChallengeId,
      code: FAKE_CODE,
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'CODE_EXPIRED',
      meta: { recoveryPath: '/sign-in' },
    });
  });
});

describe('the header values a limiter refusal carries (C-001, C-004 to C-006)', () => {
  it('carries the cap, the remainder and the reset on a refused sign-in code request', async () => {
    const fakes = createIdentityHarness({ rateLimited: { retryAfterSeconds: 30 } });

    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      cause: 'SIGN_IN_RATE_LIMITED',
      retryAfterSeconds: 30,
    });
    if (result.ok) return;
    expect(result.rateLimit).toEqual({
      limit: FAKE_RATE_LIMIT,
      remaining: 0,
      resetSeconds: FAKE_RESET_SECONDS,
      retryAfterSeconds: 30,
    });
    expect(renderRateLimitHeaders(result.rateLimit!)).toEqual({
      'RateLimit-Limit': String(FAKE_RATE_LIMIT),
      'RateLimit-Remaining': '0',
      'RateLimit-Reset': String(FAKE_RESET_SECONDS),
      'Retry-After': '30',
    });
  });

  it('carries the same values on a refused resend', async () => {
    const fakes = createIdentityHarness({
      // Past the sixty-second resend cooldown, so the limiter is the rule that refuses.
      pending: [pendingRow({ codeSentAt: '2026-11-18T08:50:00Z' })],
      rateLimited: { retryAfterSeconds: 45 },
    });

    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      cause: 'REGISTRATION_RATE_LIMITED',
      retryAfterSeconds: 45,
    });
    if (result.ok) return;
    expect(renderRateLimitHeaders(result.rateLimit!)).toMatchObject({
      'RateLimit-Limit': String(FAKE_RATE_LIMIT),
      'RateLimit-Remaining': '0',
      'Retry-After': '45',
    });
  });

  it('leaves the headers off a refusal no limiter produced', async () => {
    const fakes = createIdentityHarness({
      // Inside the resend cooldown, which the code store's own timer enforces rather than the limiter.
      pending: [pendingRow({ codeSentAt: FAKE_NOW })],
    });

    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      cause: 'RESEND_COOLDOWN',
    });
    if (result.ok) return;
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.rateLimit).toBeUndefined();
  });

  it('keeps a limiter that cannot answer out of the refusal path', async () => {
    const fakes = createIdentityHarness({ rateLimitUnavailable: true });

    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'RATE_LIMIT_UNAVAILABLE',
    });
  });
});
