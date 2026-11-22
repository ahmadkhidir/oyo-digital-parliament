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
 *
 * The last group pins the delivery rule every one-time code follows: a resend and a sign-in code leave
 * through the notification boundary, so sent, held and unreachable-queue outcomes are the same shape
 * for both, a replay sends once, and a retried message cannot mint over a newer code.
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

/**
 * One delivery rule for every one-time code (`C-004`, `C-005`, `C-076`).
 *
 * A resend and a sign-in code leave through the notification boundary exactly as the first
 * registration code does, so one hold, retry and dedupe rule covers all three. These cases pin the
 * three delivery outcomes each flow must survive — sent, held, and a boundary that cannot take the
 * message — plus the two properties the queue owes: a replay sends once, and a retried message never
 * mints over a code a newer message delivered.
 */
describe('one-time code delivery through the notification boundary (C-004, C-005, C-076)', () => {
  /** A harness whose number belongs to one live account, as a sign-in request needs. */
  const memberHarness = (options: Parameters<typeof createIdentityHarness>[0] = {}) =>
    createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })], ...options });

  /** A pending registration whose resend cooldown has already lapsed. */
  const resendablePending = () => pendingRow({ codeSentAt: '2026-11-18T08:50:00Z' });

  it('sends a registration resend through the boundary and never issues the code directly', async () => {
    const fakes = createIdentityHarness({ pending: [resendablePending()] });

    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });

    expect(result).toMatchObject({
      ok: true,
      codeDelivery: { status: 'sent', channel: 'sms' },
      codeSentAt: FAKE_NOW,
    });
    if (!result.ok) return;
    // One message, to the pending registration's own number, carrying the code the confirm step
    // accepts; the code store's direct dispatch was never reached.
    expect(fakes.smsSent).toHaveLength(1);
    expect(fakes.smsSent[0]?.destination).toBe('+2348031234567');
    expect(fakes.codeIssues).toEqual([]);
    await expect(fakes.ports.codes.matches(result.pendingRegistrationId, FAKE_CODE)).resolves.toBe(
      'match',
    );
  });

  it('holds a registration resend and reports the failed delivery, keeping the pending record', async () => {
    const fakes = createIdentityHarness({
      pending: [resendablePending()],
      smsUnavailable: true,
    });

    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });

    // `C-004`, `C-076`: the boundary retained the message for its next attempt, and the resident is
    // told the delivery did not happen; the pending registration stands and the window does not move.
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'SMS_CHANNEL_UNAVAILABLE',
      meta: { pendingRegistrationPreserved: true },
    });
    expect(fakes.pending).toHaveLength(1);
    expect(fakes.pending[0]?.codeSentAt).toBe('2026-11-18T08:50:00Z');
    expect(fakes.smsSent).toEqual([]);
  });

  it('refuses a resend when the boundary cannot take the message at all', async () => {
    const fakes = createIdentityHarness({
      pending: [resendablePending()],
      notificationsUnavailable: true,
    });

    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });

    // `C-004`: the refusal names the channel and says the pending registration survives it; the
    // resend window must not restart, because no message was queued.
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'SMS_CHANNEL_UNAVAILABLE',
      meta: { pendingRegistrationPreserved: true },
    });
    expect(fakes.pending[0]?.codeSentAt).toBe('2026-11-18T08:50:00Z');
    expect(fakes.smsSent).toEqual([]);
  });

  it('sends a registration resend once under one dedupe key', async () => {
    const fakes = createIdentityHarness({ pending: [resendablePending()] });
    const input = {
      pendingRegistrationId: 'prg_0001',
      locale: 'en-NG' as const,
      dedupeKey: `registration_code:prg_0001:${FAKE_NOW}`,
    };

    const first = await fakes.ports.notifications.deliverCode(input);
    const replay = await fakes.ports.notifications.deliverCode(input);

    expect(first).toEqual({ status: 'sent', channel: 'sms' });
    expect(replay).toEqual({ status: 'sent', channel: 'sms' });
    expect(fakes.smsSent).toHaveLength(1);
  });

  it('does not re-mint over a newer resend when the held message is retried', async () => {
    const fakes = createIdentityHarness({
      pending: [pendingRow({ codeSentAt: '2026-11-18T08:00:00Z' })],
      smsUnavailable: true,
    });
    const heldKey = `registration_code:prg_0001:${FAKE_NOW}`;

    const held = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });
    expect(held).toMatchObject({ ok: false, cause: 'SMS_CHANNEL_UNAVAILABLE' });

    // The channel returns and the resident asks again: a newer code is minted and delivered.
    fakes.setSmsUnavailable(false);
    fakes.setNow('2026-11-18T09:02:00Z');
    const newer = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });
    expect(newer).toMatchObject({ ok: true, codeDelivery: { status: 'sent' } });
    expect(fakes.smsSent).toHaveLength(1);
    const renders = fakes.codeRenders.length;
    const [delivered] = fakes.smsSent;
    if (delivered === undefined) throw new Error('the newer message was expected to be sent');

    // The older message is retried under its own dedupe key. It is superseded, so it neither renders
    // — which would void the code just delivered — nor sends a second message.
    const retry = await fakes.ports.notifications.deliverCode({
      pendingRegistrationId: 'prg_0001',
      locale: 'en-NG',
      dedupeKey: heldKey,
    });
    expect(retry).toEqual({ status: 'delayed', channel: 'sms' });
    expect(fakes.codeRenders).toHaveLength(renders);
    expect(fakes.smsSent).toHaveLength(1);
    await expect(fakes.ports.codes.matches('prg_0001', FAKE_CODE)).resolves.toBe('match');
  });

  it('sends a sign-in code through the boundary to the account that holds the number', async () => {
    const fakes = memberHarness();

    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });

    expect(result).toMatchObject({ ok: true, codeDelivery: { status: 'sent', channel: 'sms' } });
    if (!result.ok) return;
    expect(fakes.smsSent).toHaveLength(1);
    expect(fakes.smsSent[0]?.destination).toBe('+2348031234567');
    expect(fakes.codeIssues).toEqual([]);
    // The challenge is the code's target, and the code the message carried is the one it accepts.
    expect(fakes.smsSent[0]?.dedupeKey).toContain(result.signInChallengeId);
    await expect(fakes.ports.codes.matches(result.signInChallengeId, FAKE_CODE)).resolves.toBe(
      'match',
    );
  });

  it('holds a sign-in code and still starts the challenge', async () => {
    const fakes = memberHarness({ smsUnavailable: true });

    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });

    // `C-005`, `C-076`: the message is retained, but no code reached the resident, so the request is
    // degraded while the challenge it opened stands for its own window.
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'SMS_CHANNEL_UNAVAILABLE',
      retryAfterSeconds: 30,
    });
    expect(fakes.challenges).toHaveLength(1);
    expect(fakes.smsSent).toEqual([]);
  });

  it('refuses a sign-in code when the boundary cannot take the message at all', async () => {
    const fakes = memberHarness({ notificationsUnavailable: true });

    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });

    // `C-005`: no code was queued or sent, so the request is degraded rather than accepted.
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'SMS_CHANNEL_UNAVAILABLE',
      retryAfterSeconds: 30,
    });
    expect(fakes.smsSent).toEqual([]);
  });

  it('sends a sign-in code once under one dedupe key', async () => {
    const fakes = memberHarness();
    const requested = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });
    if (!requested.ok) throw new Error('the sign-in code was expected to be sent');
    const [message] = fakes.smsSent;
    if (message === undefined) throw new Error('the boundary was expected to send one message');

    const replay = await fakes.ports.notifications.deliverCode({
      pendingRegistrationId: requested.signInChallengeId,
      memberId: 'mbr_0001',
      locale: 'en-NG',
      dedupeKey: message.dedupeKey,
    });

    expect(replay).toEqual({ status: 'sent', channel: 'sms' });
    expect(fakes.smsSent).toHaveLength(1);
  });

  it('carries no destination number and no code in a queue row, a key or an event', async () => {
    const fakes = memberHarness();

    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });
    if (!result.ok) throw new Error('the sign-in code was expected to be sent');

    const [message] = fakes.smsSent;
    expect(message?.dedupeKey).toMatch(/^sign_in_code:/);
    expect(message?.dedupeKey).not.toContain('+2348031234567');
    expect(message?.dedupeKey).not.toContain(FAKE_CODE);

    // `C-076`, `NFR-024`: the row holds the target and the window, never the digits or a number.
    const queued = JSON.stringify([...fakes.notificationQueue]);
    expect(queued).not.toContain('+2348031234567');
    expect(queued).not.toContain(FAKE_CODE);

    // `EVT-002`, `C-089`: the event names the attempt and the account, nothing about the person.
    const emitted = JSON.stringify(fakes.analytics);
    expect(emitted).not.toContain('+2348031234567');
    expect(emitted).not.toContain(FAKE_CODE);
  });
});
