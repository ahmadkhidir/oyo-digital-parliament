/**
 * Sign-in and session tests (`C-005` to `C-008`, `FEAT-001`).
 *
 * A number belongs to at most one account, so sign-in resolves that account without an account
 * choice; the session read reports both namespaces; signing out ends the current session only.
 */
import { describe, expect, it } from 'vitest';
import {
  beginStaffSignIn,
  completeSignIn,
  readSession,
  requestSignInCode,
  signOut,
} from '../index.ts';
import {
  FAKE_CODE,
  FAKE_NOW,
  FAKE_PASSWORD,
  createIdentityHarness,
  fakeMember,
  fakeStaffCredential,
  fakeStaffUser,
} from '../fakes.ts';

const publicCaller = { kind: 'public' as const, locale: 'en-NG' as const };

describe('requestSignInCode (C-005)', () => {
  it('starts a challenge for the one account that holds the number and names no account', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });
    expect(result.ok).toBe(true);
    // `C-005`: no account count, no account list, and no name before the code is accepted.
    expect(result).not.toHaveProperty('accountCount');
    expect(result).not.toHaveProperty('accountChoiceRequired');
    expect(JSON.stringify(result)).not.toContain('Seun A.');
    expect(fakes.analytics).toEqual([
      {
        name: 'sign_in_started',
        properties: { attempt: 1 },
        // `C-089`: the number resolves to one account, so that account is the event's subject.
        subject: { kind: 'member', memberId: 'mbr_0001' },
        locale: 'en-NG',
      },
    ]);
  });

  it('sends a visitor without an account to registration', async () => {
    const fakes = createIdentityHarness();
    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      cause: 'NO_ACCOUNT_FOR_NUMBER',
      meta: { recoveryPath: '/join' },
    });
  });

  it('refuses a malformed number', async () => {
    const fakes = createIdentityHarness();
    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '12345',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { telephoneNumber: 'PATTERN_MISMATCH' },
    });
  });
});

describe('completeSignIn (C-006)', () => {
  const signInSetup = async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    const request = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });
    expect(request.ok).toBe(true);
    const challengeId = (request as { signInChallengeId: string }).signInChallengeId;
    fakes.codes.set(challengeId, { code: FAKE_CODE, attempts: 0 });
    return { fakes, challengeId };
  };

  it('opens the session for the one account that holds the number', async () => {
    const { fakes, challengeId } = await signInSetup();
    const result = await completeSignIn(publicCaller, fakes.ports, {
      signInChallengeId: challengeId,
      code: FAKE_CODE,
      returnTo: '/s/ODP-004821',
    });
    expect(result).toMatchObject({
      ok: true,
      member: { id: 'mbr_0001' },
      session: { established: true },
      returnTo: '/s/ODP-004821',
    });
    expect(fakes.memberSessions.size).toBe(1);
    expect(fakes.audit[0]).toMatchObject({ action: 'member.signed_in', entityId: 'mbr_0001' });
  });

  it('refuses a wrong code with the attempts remaining', async () => {
    const { fakes, challengeId } = await signInSetup();
    const result = await completeSignIn(publicCaller, fakes.ports, {
      signInChallengeId: challengeId,
      code: '000000',
    });
    expect(result).toMatchObject({
      ok: false,
      cause: 'CODE_INCORRECT',
      attemptsRemaining: 2,
    });
    expect(fakes.memberSessions.size).toBe(0);
  });

  it('refuses a challenge that has already been used', async () => {
    const { fakes, challengeId } = await signInSetup();
    await completeSignIn(publicCaller, fakes.ports, {
      signInChallengeId: challengeId,
      code: FAKE_CODE,
    });
    const again = await completeSignIn(publicCaller, fakes.ports, {
      signInChallengeId: challengeId,
      code: FAKE_CODE,
    });
    expect(again).toMatchObject({ ok: false, cause: 'CODE_ALREADY_USED' });
  });

  it('refuses an expired challenge', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
    });
    fakes.challenges.push({
      id: 'sic_OLD1',
      telephoneNumber: '+2348031234567',
      memberIds: ['mbr_0001'],
      codeSentAt: '2026-11-18T08:00:00Z',
      expiresAt: '2026-11-18T08:10:00Z',
    });
    fakes.codes.set('sic_OLD1', { code: FAKE_CODE, attempts: 0 });
    const result = await completeSignIn(publicCaller, fakes.ports, {
      signInChallengeId: 'sic_OLD1',
      code: FAKE_CODE,
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      cause: 'SIGN_IN_CHALLENGE_EXPIRED',
    });
  });
});

describe('readSession (C-007)', () => {
  it('answers signed out without an error', async () => {
    const fakes = createIdentityHarness();
    const result = await readSession(fakes.ports, { locale: 'yo-NG' });
    expect(result).toEqual({
      ok: true,
      signedIn: false,
      member: null,
      staff: null,
      locale: 'yo-NG',
    });
  });

  it('reads a member session and never a staff object', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    fakes.memberSessions.set('ses_member_1', {
      sessionId: 'ses_member_1',
      memberId: 'mbr_0001',
      expiresAt: '2026-11-18T21:00:00Z',
      absoluteExpiresAt: '2026-11-18T21:00:00Z',
      lastSeenAt: FAKE_NOW,
    });
    const result = await readSession(fakes.ports, { memberSessionToken: 'ses_member_1' });
    expect(result).toMatchObject({
      ok: true,
      signedIn: true,
      staff: null,
      member: { id: 'mbr_0001', displayName: 'Seun A.' },
    });
    expect(JSON.stringify(result)).not.toContain('+2348031234567');
  });

  it('reads a staff session and never a member object', async () => {
    const fakes = createIdentityHarness({
      staff: [fakeStaffUser({ id: 'stf_0001', secondFactorEnrolled: true })],
      credentials: [
        fakeStaffCredential({ id: 'cred_0001', staffUserId: 'stf_0001', username: 'a.balogun' }),
      ],
    });
    await beginStaffSignIn(publicCaller, fakes.ports, {
      username: 'a.balogun',
      password: FAKE_PASSWORD,
      idempotencyKey: 'key-1',
    });
    const token = [...fakes.staffSessions.keys()][0] ?? '';
    const result = await readSession(fakes.ports, { staffSessionToken: token });
    expect(result).toMatchObject({
      ok: true,
      signedIn: true,
      member: null,
      staff: { id: 'stf_0001', secondFactorSatisfied: false },
      session: { expiresAt: '2026-11-18T09:10:00Z' },
    });
  });

  it('treats an unreadable session store as degraded', async () => {
    const fakes = createIdentityHarness({ sessionStoreUnavailable: true });
    const result = await readSession(fakes.ports, { memberSessionToken: 'ses_member_1' });
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'SESSION_STORE_UNAVAILABLE',
    });
  });
});

describe('signOut (C-008)', () => {
  it('ends the current member session and audits once', async () => {
    const fakes = createIdentityHarness();
    fakes.memberSessions.set('ses_member_1', {
      sessionId: 'ses_member_1',
      memberId: 'mbr_0001',
      expiresAt: '2026-11-18T21:00:00Z',
      absoluteExpiresAt: '2026-11-18T21:00:00Z',
      lastSeenAt: FAKE_NOW,
    });
    const result = await signOut(
      { kind: 'member', memberId: 'mbr_0001', sessionId: 'ses_member_1' },
      fakes.ports,
      { allSessions: false },
    );
    expect(result).toEqual({ ok: true });
    expect(fakes.endedSessionIds.has('ses_member_1')).toBe(true);
    expect(fakes.audit[0]).toMatchObject({ action: 'member.signed_out', actorId: 'mbr_0001' });
  });

  it('refuses a staff session and an absent one', async () => {
    const fakes = createIdentityHarness();
    const staff = await signOut(
      {
        kind: 'staff',
        staffId: 'stf_0001',
        role: 'operator',
        external: false,
        authorisedWardIds: [],
        secondFactorSatisfied: true,
        secondFactorEnrolled: true,
        sessionId: 'ses_staff_1',
        sessionStartedAt: FAKE_NOW,
        sessionExpiresAt: '2026-11-18T09:10:00Z',
        locale: 'en-NG',
      },
      fakes.ports,
      {},
    );
    expect(staff).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE' });

    const absent = await signOut(publicCaller, fakes.ports, {});
    expect(absent).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
  });
});
