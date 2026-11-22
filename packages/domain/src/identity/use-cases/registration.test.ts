/**
 * Registration flow tests (`C-002`, `C-003`, `C-004`, `FEAT-001`).
 *
 * The account does not exist until the code is accepted, the code windows and attempt limits hold, and
 * a shared number keeps two accounts.
 */
import { describe, expect, it } from 'vitest';
import { confirmRegistration, registerResident, resendRegistrationCode } from '../index.ts';
import { FAKE_CODE, FAKE_NOW, createIdentityHarness, fakeMember } from '../fakes.ts';
import type { PendingRegistration } from '../entities.ts';

const publicCaller = { kind: 'public' as const, locale: 'en-NG' as const };

const pendingRow = (overrides: Partial<PendingRegistration> = {}): PendingRegistration => ({
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
});

describe('registerResident (C-002)', () => {
  it('creates a pending registration and no account', async () => {
    const fakes = createIdentityHarness();
    const result = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '0803 123 4567',
      displayName: 'Seun A.',
    });

    expect(result).toMatchObject({
      ok: true,
      telephoneNumber: '+2348031234567',
      nextScreen: '/join/confirm',
      codeDelivery: { status: 'sent', channel: 'sms' },
    });
    expect(fakes.pending).toHaveLength(1);
    expect(fakes.members).toHaveLength(0);
    expect(fakes.audit).toEqual([]);
    expect(fakes.analytics).toEqual([
      {
        name: 'registration_started',
        properties: { locale: 'en-NG' },
        // `C-089`: no account exists yet, so the pending registration is the event's subject.
        subject: { kind: 'anonymous', anonymousId: 'prg_0001' },
        locale: 'en-NG',
      },
    ]);
  });

  it('refuses an age outside the band and creates nothing', async () => {
    const fakes = createIdentityHarness();
    const result = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 36,
      telephoneNumber: '+2348031234567',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { declaredAge: 'OUT_OF_BAND' },
    });
    expect(fakes.pending).toEqual([]);
  });

  it('offers recovery of an existing account unless the number is declared shared', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
    });
    const refused = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '+2348031234567',
    });
    expect(refused).toMatchObject({
      ok: false,
      cause: 'ALREADY_REGISTERED',
      meta: { recoveryPath: '/sign-in' },
    });

    const accepted = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '+2348031234567',
      sharedNumberDeclaration: true,
    });
    expect(accepted.ok).toBe(true);
    expect(fakes.pending).toHaveLength(1);
  });

  it('generates a display name for a resident who supplies none', async () => {
    const fakes = createIdentityHarness();
    const result = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '+2348031234567',
    });
    expect(result.ok).toBe(true);
    expect(fakes.pending[0]?.displayName.startsWith('Oluwaseun ')).toBe(true);
  });

  it('answers 201 with a delayed dispatch when the message gateway refuses', async () => {
    const fakes = createIdentityHarness({ smsUnavailable: true });
    const result = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '+2348031234567',
    });
    expect(result).toMatchObject({ ok: true, codeDelivery: { status: 'delayed' } });
    expect(fakes.pending).toHaveLength(1);
  });

  it('refuses when the limiter itself is unreachable', async () => {
    const fakes = createIdentityHarness({ rateLimitUnavailable: true });
    const result = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '+2348031234567',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'RATE_LIMIT_UNAVAILABLE',
    });
    expect(fakes.pending).toEqual([]);
  });

  it('rate-limits the number', async () => {
    const fakes = createIdentityHarness({ rateLimited: { retryAfterSeconds: 45 } });
    const result = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '+2348031234567',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 45,
    });
  });
});

describe('registration code delivery (C-002, C-076)', () => {
  const register = (fakes: ReturnType<typeof createIdentityHarness>) =>
    registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '+2348031234567',
      displayName: 'Seun A.',
    });

  it('hands the code to the notification boundary, which sends it through the SMS port', async () => {
    const fakes = createIdentityHarness();
    const result = await register(fakes);

    expect(result).toMatchObject({ ok: true, codeDelivery: { status: 'sent', channel: 'sms' } });
    if (!result.ok) return;

    // One message, to the pending registration's own number, and the digits in it are the code the
    // confirmation step accepts (`C-002`, `C-003`).
    expect(fakes.smsSent).toHaveLength(1);
    expect(fakes.smsSent[0]?.destination).toBe(result.telephoneNumber);
    await expect(fakes.ports.codes.matches(result.pendingRegistrationId, FAKE_CODE)).resolves.toBe(
      'match',
    );
  });

  it('holds the message and keeps the pending registration when the channel is down', async () => {
    const fakes = createIdentityHarness({ smsUnavailable: true });
    const result = await register(fakes);

    // `C-002`: still 201, with `delayed` and a registration that stands for its twenty-four hours.
    expect(result).toMatchObject({ ok: true, codeDelivery: { status: 'delayed' } });
    if (!result.ok) return;
    expect(fakes.pending).toHaveLength(1);

    // Nothing was sent, so nothing may be accepted: there is no code to prove.
    await expect(fakes.ports.codes.matches(result.pendingRegistrationId, FAKE_CODE)).resolves.toBe(
      'absent',
    );
  });

  it('does not send twice under one dedupe key', async () => {
    const fakes = createIdentityHarness();
    const result = await register(fakes);
    if (!result.ok) throw new Error('registration was expected to succeed');
    const [message] = fakes.smsSent;
    if (message === undefined) throw new Error('the boundary was expected to send one message');

    const replay = await fakes.ports.notifications.deliverCode({
      pendingRegistrationId: result.pendingRegistrationId,
      locale: 'en-NG',
      dedupeKey: message.dedupeKey,
    });

    expect(replay).toEqual({ status: 'sent', channel: 'sms' });
    expect(fakes.smsSent).toHaveLength(1);
  });

  it('carries no destination number and no code in the queue key or an event', async () => {
    const fakes = createIdentityHarness();
    await register(fakes);

    const [message] = fakes.smsSent;
    expect(message?.dedupeKey).toMatch(/^registration_code:/);
    expect(message?.dedupeKey).not.toContain('+2348031234567');
    expect(message?.dedupeKey).not.toContain(FAKE_CODE);

    // `EVT-042`, `NFR-024`: the event names the pending registration and nothing about the person.
    const emitted = JSON.stringify(fakes.analytics);
    expect(emitted).not.toContain('+2348031234567');
    expect(emitted).not.toContain(FAKE_CODE);
  });
});

describe('confirmRegistration (C-003)', () => {
  const harnessWithPending = (options: Parameters<typeof createIdentityHarness>[0] = {}) => {
    const fakes = createIdentityHarness({ pending: [pendingRow()], ...options });
    fakes.codes.set('prg_0001', { code: FAKE_CODE, attempts: 0 });
    return fakes;
  };

  it('creates the registered account, opens a session and audits once', async () => {
    const fakes = harnessWithPending();
    const result = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });

    expect(result).toMatchObject({
      ok: true,
      member: {
        identityState: 'registered',
        verificationMethod: 'self_code',
        wardStatus: 'unresolved',
        sharedNumber: false,
        locale: 'en-NG',
      },
      session: { established: true },
      nextScreen: '/join/ward',
    });
    expect(fakes.members).toHaveLength(1);
    expect(fakes.pending[0]?.verifiedAt).toBe(FAKE_NOW);
    expect(fakes.memberSessions.size).toBe(1);
    expect(fakes.audit).toHaveLength(1);
    expect(fakes.audit[0]).toMatchObject({ action: 'member.registered', entityType: 'Member' });
    expect(fakes.analytics.map((event) => event.name)).toEqual([
      'number_confirmed',
      'account_registered',
    ]);

    // The summary is public and carries no personal field.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const keys = Object.keys(result.member);
    expect(keys).not.toContain('telephoneNumber');
    expect(keys).not.toContain('fullName');
    expect(keys).not.toContain('declaredAge');
  });

  it('marks both accounts as sharing one number without merging them', async () => {
    const fakes = harnessWithPending({ members: [fakeMember({ id: 'mbr_EXISTING' })] });
    const result = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });
    expect(result.ok).toBe(true);
    expect(fakes.members).toHaveLength(2);
    expect(fakes.members.every((member) => member.sharedNumber)).toBe(true);
    expect(new Set(fakes.members.map((member) => member.id)).size).toBe(2);
  });

  it('states the attempts remaining on a wrong code, then rate-limits the third', async () => {
    const fakes = harnessWithPending();
    const wrong = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: '000000',
    });
    expect(wrong).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'CODE_INCORRECT',
      attemptsRemaining: 2,
    });

    await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: '000000',
    });
    const third = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: '000000',
    });
    expect(third).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      cause: 'CODE_ATTEMPTS_EXCEEDED',
    });
    expect(fakes.members).toEqual([]);
  });

  it('refuses an expired or unknown pending registration', async () => {
    const fakes = createIdentityHarness({
      pending: [pendingRow({ expiresAt: '2026-11-18T08:00:00Z' })],
    });
    fakes.codes.set('prg_0001', { code: FAKE_CODE, attempts: 0 });
    const expired = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });
    expect(expired).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      cause: 'PENDING_REGISTRATION_EXPIRED',
    });

    const unknown = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_MISSING',
      code: FAKE_CODE,
    });
    expect(unknown).toMatchObject({ ok: false, cause: 'PENDING_REGISTRATION_EXPIRED' });
  });

  it('refuses a code that already created an account', async () => {
    const fakes = harnessWithPending();
    await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });
    const again = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });
    expect(again).toMatchObject({ ok: false, cause: 'CODE_ALREADY_USED' });
  });

  it('fails the write when the audit log refuses', async () => {
    const fakes = harnessWithPending({ auditUnavailable: true });
    const result = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'AUDIT_APPEND_FAILED',
    });
  });
});

describe('resendRegistrationCode (C-004)', () => {
  it('issues a new code without extending the 24-hour window', async () => {
    const fakes = createIdentityHarness({
      pending: [pendingRow({ codeSentAt: '2026-11-18T08:50:00Z' })],
    });
    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });
    expect(result).toMatchObject({ ok: true, expiresAt: '2026-11-19T09:00:00Z' });
    expect(fakes.pending[0]?.expiresAt).toBe('2026-11-19T09:00:00Z');
    expect(fakes.pending[0]?.codeSentAt).toBe(FAKE_NOW);
  });

  it('holds the one-minute cooldown', async () => {
    const fakes = createIdentityHarness({ pending: [pendingRow()] });
    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 60,
    });
  });

  it('keeps the pending registration when the message cannot be sent', async () => {
    const fakes = createIdentityHarness({
      pending: [pendingRow({ codeSentAt: '2026-11-18T08:50:00Z' })],
      smsUnavailable: true,
    });
    const result = await resendRegistrationCode(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'SMS_CHANNEL_UNAVAILABLE',
      meta: { pendingRegistrationPreserved: true },
    });
    expect(fakes.pending).toHaveLength(1);
  });
});
