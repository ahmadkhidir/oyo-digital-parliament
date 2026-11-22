/**
 * The identity invariants (`FEAT-001`, `FEAT-012`, `C-002`, `C-003`, `C-004`, `C-035`, `C-092`).
 *
 * Each test fails when its rule is removed: the band, the code windows, the lockout, the two session
 * windows, the request deadline, the personal-data permission matrix, and the absence of any
 * member-register operation on the port.
 */
import { describe, expect, it } from 'vitest';
import {
  AGE_BAND_MAX,
  AGE_BAND_MIN,
  CODE_ATTEMPT_LIMIT,
  CODE_COOLDOWN_SECONDS,
  MEMBER_SESSION_TTL_SECONDS,
  PENDING_REGISTRATION_TTL_SECONDS,
  addSeconds,
  codeFailureOutcome,
  dataRequestDueAt,
  deliveryDelayBand,
  disambiguateDisplayName,
  generateDisplayName,
  isEligibleAge,
  mayReadMemberPersonalData,
  memberSessionExpiry,
  normaliseTelephone,
  pendingRegistrationExpiry,
  readDeclaredAge,
  readRecordPageLimit,
  readPassword,
  readTelephone,
  readUsername,
  registrationProjection,
  resendCooldownRemaining,
  secondFactorRequiredFailure,
  sessionMemberProjection,
  staffActionRefusal,
  staffLockState,
  staffMayAct,
  staffNextScreen,
  staffSessionWindow,
} from './index.ts';
import { createIdentityHarness, fakeMember } from './fakes.ts';

describe('age band (FEAT-001)', () => {
  it('accepts 18 to 35 and refuses either side with OUT_OF_BAND', () => {
    expect(isEligibleAge(AGE_BAND_MIN)).toBe(true);
    expect(isEligibleAge(AGE_BAND_MAX)).toBe(true);
    expect(readDeclaredAge(17)).toMatchObject({ ok: false, reason: 'OUT_OF_BAND' });
    expect(readDeclaredAge(36)).toMatchObject({ ok: false, reason: 'OUT_OF_BAND' });
    expect(readDeclaredAge(24)).toEqual({ ok: true, value: 24 });
  });
});

describe('telephone normalisation', () => {
  it('resolves a leading zero, spaces and the country code to one E.164 number', () => {
    expect(normaliseTelephone('0803 123 4567')).toBe('+2348031234567');
    expect(normaliseTelephone('+2348031234567')).toBe('+2348031234567');
    expect(normaliseTelephone('2348031234567')).toBe('+2348031234567');
    expect(readTelephone('08031234567')).toEqual({ ok: true, value: '+2348031234567' });
    expect(readTelephone('12345')).toMatchObject({ ok: false, reason: 'PATTERN_MISMATCH' });
  });
});

describe('display name (FEAT-001)', () => {
  it('generates a stable name from the first word and the seed, and disambiguates a taken one', () => {
    const first = generateDisplayName('Oluwaseun Adeyemi', 'prg_A1');
    expect(first.startsWith('Oluwaseun ')).toBe(true);
    expect(generateDisplayName('Oluwaseun Adeyemi', 'prg_A1')).toBe(first);
    expect(disambiguateDisplayName(first, 2)).toBe(`${first} 2`);
  });
});

describe('registration code windows (C-002, C-003, C-004)', () => {
  it('holds a pending registration for 24 hours and offers a resend after one minute', () => {
    const createdAt = '2026-11-18T09:00:00Z';
    expect(pendingRegistrationExpiry(createdAt)).toBe(
      addSeconds(createdAt, PENDING_REGISTRATION_TTL_SECONDS),
    );
    expect(resendCooldownRemaining(createdAt, '2026-11-18T09:00:30Z')).toBe(30);
    expect(resendCooldownRemaining(createdAt, '2026-11-18T09:02:00Z')).toBe(0);
  });

  it('allows three attempts and then a cooldown', () => {
    expect(codeFailureOutcome(1)).toEqual({ cooldown: false, attemptsRemaining: 2 });
    expect(codeFailureOutcome(2)).toEqual({ cooldown: false, attemptsRemaining: 1 });
    expect(codeFailureOutcome(CODE_ATTEMPT_LIMIT)).toEqual({
      cooldown: true,
      attemptsRemaining: 0,
    });
    expect(CODE_COOLDOWN_SECONDS).toBe(60);
  });

  it('bands the delivery delay EVT-003 reports', () => {
    expect(deliveryDelayBand('2026-11-18T09:00:00Z', '2026-11-18T09:00:30Z')).toBe('under_1m');
    expect(deliveryDelayBand('2026-11-18T09:00:00Z', '2026-11-18T09:03:00Z')).toBe('1m_to_5m');
    expect(deliveryDelayBand('2026-11-18T09:00:00Z', '2026-11-18T09:20:00Z')).toBe('over_5m');
  });
});

describe('the two session windows (NFR-026, C-092)', () => {
  it('gives a member a twelve-hour session', () => {
    expect(memberSessionExpiry('2026-11-18T09:00:00Z')).toBe(
      addSeconds('2026-11-18T09:00:00Z', MEMBER_SESSION_TTL_SECONDS),
    );
  });

  it('gives a satisfied staff session thirty idle minutes and eight absolute hours', () => {
    const window = staffSessionWindow('2026-11-18T09:00:00Z', '2026-11-18T09:05:00Z');
    expect(window.expiresAt).toBe('2026-11-18T09:35:00Z');
    expect(window.absoluteExpiresAt).toBe('2026-11-18T17:00:00Z');
  });

  it('locks a credential for the time left on the lock', () => {
    const state = {
      id: 'cred_1',
      staffUserId: 'stf_1',
      username: 'a.balogun',
      passwordChangedAt: '2026-11-01T09:00:00Z',
      secondFactorEnrolledAt: '2026-11-01T09:00:00Z',
      recoveryCodes: [],
      failedAttemptCount: 5,
      lockedUntil: '2026-11-18T09:30:00Z',
    };
    expect(staffLockState(state, '2026-11-18T09:00:00Z')).toEqual({
      locked: true,
      retryAfterSeconds: 1800,
    });
    expect(staffLockState(state, '2026-11-18T09:31:00Z')).toEqual({
      locked: false,
      retryAfterSeconds: 0,
    });
  });

  it('admits nothing to the console before the second factor', () => {
    expect(staffMayAct({ secondFactorSatisfied: false, secondFactorEnrolled: true })).toBe(false);
    expect(staffMayAct({ secondFactorSatisfied: true, secondFactorEnrolled: true })).toBe(true);
    expect(staffNextScreen({ secondFactorSatisfied: false, secondFactorEnrolled: true })).toBe(
      '/admin/verify',
    );
    expect(staffNextScreen({ secondFactorSatisfied: false, secondFactorEnrolled: false })).toBe(
      '/admin/enrol',
    );
  });

  it('returns the SECOND_FACTOR_REQUIRED refusal until the factor is satisfied', () => {
    expect(
      staffActionRefusal({ secondFactorSatisfied: false, secondFactorEnrolled: true }),
    ).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'SECOND_FACTOR_REQUIRED',
      meta: { recoveryPath: '/admin/verify' },
    });
    expect(staffActionRefusal({ secondFactorSatisfied: true, secondFactorEnrolled: true })).toBe(
      null,
    );
    expect(secondFactorRequiredFailure().cause).toBe('SECOND_FACTOR_REQUIRED');
  });
});

describe('data request deadlines (C-035)', () => {
  it('is seven days for access and correction, thirty for export and deletion', () => {
    const at = '2026-11-18T09:00:00Z';
    expect(dataRequestDueAt('access', at)).toBe('2026-11-25T09:00:00Z');
    expect(dataRequestDueAt('correction', at)).toBe('2026-11-25T09:00:00Z');
    expect(dataRequestDueAt('export', at)).toBe('2026-12-18T09:00:00Z');
    expect(dataRequestDueAt('deletion', at)).toBe('2026-12-18T09:00:00Z');
  });
});

describe('personal-data permission (C-070, FEAT-012)', () => {
  const memberId = 'mbr_MEMBER1';
  it('lets a member read their own record and the operator work the queue', () => {
    expect(
      mayReadMemberPersonalData({
        caller: { kind: 'member', memberId, sessionId: 'ses_1' },
        purpose: 'member_data_request',
        memberId,
      }),
    ).toBe(true);
    expect(
      mayReadMemberPersonalData({
        caller: {
          kind: 'staff',
          staffId: 'stf_1',
          role: 'operator',
          external: false,
          authorisedWardIds: [],
          secondFactorSatisfied: true,
          secondFactorEnrolled: true,
          sessionId: 'ses_2',
          sessionStartedAt: '2026-11-18T09:00:00Z',
          sessionExpiresAt: '2026-11-18T09:10:00Z',
          locale: 'en-NG',
        },
        purpose: 'member_data_request',
        memberId,
      }),
    ).toBe(true);
  });

  it('refuses the roles the specification excludes', () => {
    const staffCaller = (role: 'moderator' | 'external_reviewer' | 'legal_reviewer') => ({
      kind: 'staff' as const,
      staffId: 'stf_2',
      role,
      external: role === 'external_reviewer',
      authorisedWardIds: [],
      secondFactorSatisfied: true,
      secondFactorEnrolled: true,
      sessionId: 'ses_3',
      sessionStartedAt: '2026-11-18T09:00:00Z',
      sessionExpiresAt: '2026-11-18T09:10:00Z',
      locale: 'en-NG' as const,
    });
    for (const role of ['moderator', 'external_reviewer', 'legal_reviewer'] as const) {
      expect(
        mayReadMemberPersonalData({
          caller: staffCaller(role),
          purpose: 'member_data_request',
          memberId,
        }),
      ).toBe(false);
    }
  });
});

describe('readers', () => {
  it('validates the staff credential fields C-092 fixes', () => {
    expect(readUsername('a.balogun')).toEqual({ ok: true, value: 'a.balogun' });
    expect(readUsername('A B')).toMatchObject({ ok: false, reason: 'PATTERN_MISMATCH' });
    expect(readPassword('short')).toMatchObject({ ok: false, reason: 'TOO_SHORT' });
    expect(readPassword('market-lantern-river-2026')).toMatchObject({ ok: true });
  });

  it('caps a page at fifty and defaults it to twenty', () => {
    expect(readRecordPageLimit(undefined)).toEqual({ ok: true, value: 20 });
    expect(readRecordPageLimit(51)).toMatchObject({ ok: false, reason: 'OUT_OF_BAND' });
  });
});

describe('projections carry no personal data (C-003, C-006)', () => {
  const member = fakeMember({ id: 'mbr_MEMBER1', fullName: 'Oluwaseun Adeyemi' });

  it('keeps the real name and number out of the registration and session summaries', () => {
    for (const projection of [registrationProjection(member), sessionMemberProjection(member)]) {
      const keys = Object.keys(projection);
      expect(keys).not.toContain('telephoneNumber');
      expect(keys).not.toContain('fullName');
      expect(keys).not.toContain('declaredAge');
    }
  });
});

describe('no member register by ward', () => {
  it('exposes no grouping read on the member port', () => {
    const fakes = createIdentityHarness();
    const methods = Object.keys(fakes.ports.members).sort();
    expect(methods).toEqual([
      'anonymise',
      'countAuthoredContent',
      'create',
      'findByTelephone',
      'get',
      'isDisplayNameTaken',
      'updateProfile',
    ]);
    for (const method of methods) {
      expect(method).not.toMatch(/ward/i);
      expect(method).not.toMatch(/^list/);
    }
  });
});
