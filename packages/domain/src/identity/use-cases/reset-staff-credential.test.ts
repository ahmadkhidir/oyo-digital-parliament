/**
 * The operator's staff credential reset (`C-093`, `NFR-020`, `NFR-021`, `NFR-026`, `NFR-028`,
 * `operations.md` Lockout and recovery, screen 26).
 *
 * The suite runs the use case against the in-memory identity harness plus a reset store double, so
 * the rules it names are proved without a database: one write replaces the password and clears the
 * second factor, every session ends and is counted, a self-reset and a wrong role are refused and
 * recorded, a replay writes once and a repeat under a new key is neither refused nor doubled.
 *
 * The reset double mirrors the SQL repository's end state; `packages/db` proves the statement itself.
 */
import { describe, expect, it } from 'vitest';

import type { IdentityCaller, StaffCredentialState, StaffRole, StaffUser } from '../entities.ts';
import {
  FAKE_NOW,
  FAKE_PASSWORD,
  createIdentityHarness,
  fakeStaffCredential,
  fakeStaffUser,
  type FakeStaffCredential,
  type IdentityHarness,
} from '../fakes.ts';
import type { StaffCredentialResetPort, StaffResetTarget } from '../ports.ts';
import {
  readStaffResetTargets,
  resetStaffCredential,
  type ResetStaffCredentialDeps,
} from './reset-staff-credential.ts';

const OPERATOR_ID = 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP';
const TARGET_ID = 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NQ';
const NEW_PASSWORD = 'harbour-lantern-quiet-2026';
const REASON = 'Second-factor handset lost; identity confirmed in person against the staff record.';

/** The operator's satisfied staff session. */
function operatorCaller(overrides: Partial<Extract<IdentityCaller, { kind: 'staff' }>> = {}) {
  return {
    kind: 'staff' as const,
    staffId: OPERATOR_ID,
    role: 'operator' as StaffRole,
    external: false,
    authorisedWardIds: [],
    secondFactorSatisfied: true,
    secondFactorEnrolled: true,
    sessionId: 'ses_operator_session',
    sessionStartedAt: FAKE_NOW,
    sessionExpiresAt: '2026-11-18T09:10:00Z',
    locale: 'en-NG' as const,
    ...overrides,
  };
}

/** The StaffCredential projection the reset store answers with. */
function credentialState(row: FakeStaffCredential): StaffCredentialState {
  return {
    id: row.id,
    staffUserId: row.staffUserId,
    username: row.username,
    passwordChangedAt: row.passwordChangedAt,
    ...(row.enrolledAt === undefined ? {} : { secondFactorEnrolledAt: row.enrolledAt }),
    recoveryCodes: row.recoveryCodes.map((code) =>
      code.usedAt === undefined ? {} : { usedAt: code.usedAt },
    ),
    failedAttemptCount: row.failedAttemptCount,
    ...(row.lockedUntil === undefined ? {} : { lockedUntil: row.lockedUntil }),
  };
}

/** A reset store double over the harness's credential rows. */
function resetStore(harness: IdentityHarness): StaffCredentialResetPort {
  const targets: StaffResetTarget[] = harness.credentials.map((row) => {
    const staff = harness.staff.find((candidate) => candidate.id === row.staffUserId);
    return {
      staffUserId: row.staffUserId,
      fullName: staff?.fullName ?? '',
      role: staff?.role ?? 'response_staff',
      active: staff?.active ?? true,
      secondFactorEnrolled: staff?.secondFactorEnrolled ?? false,
    };
  });

  return {
    async listResetTargets() {
      return targets;
    },
    async resetCredential({ credentialId, newPassword, at }) {
      const index = harness.credentials.findIndex((row) => row.id === credentialId);
      const row = harness.credentials[index];
      if (row === undefined) throw new Error('no such credential');
      harness.credentials[index] = {
        ...row,
        password: newPassword,
        passwordChangedAt: at,
        enrolledAt: undefined,
        recoveryCodes: [],
        failedAttemptCount: 0,
        lockedUntil: undefined,
        lastFailureAt: undefined,
      };
      return credentialState(harness.credentials[index] as FakeStaffCredential);
    },
  };
}

/** The use case's dependencies over the harness. */
function depsFor(harness: IdentityHarness): ResetStaffCredentialDeps {
  return {
    credentials: harness.ports.credentials,
    reset: resetStore(harness),
    staffUsers: harness.ports.staffUsers,
    staffSessions: harness.ports.staffSessions,
    rateLimits: harness.ports.rateLimits,
    idempotency: harness.ports.idempotency,
    audit: harness.ports.audit,
    clock: harness.ports.clock,
    identifiers: harness.ports.identifiers,
  };
}

/** One operator, one enrolled response-staff target and the target's credential. */
function harnessWithTarget(
  options: {
    readonly target?: Partial<StaffUser>;
    readonly credential?: Partial<FakeStaffCredential>;
  } = {},
): IdentityHarness {
  const operator = fakeStaffUser({
    id: OPERATOR_ID,
    fullName: 'Campaign Operator',
    role: 'operator',
  });
  const target = fakeStaffUser({
    id: TARGET_ID,
    fullName: 'B. Adebayo',
    role: 'response_staff',
    ...options.target,
  });
  return createIdentityHarness({
    staff: [operator, target],
    credentials: [
      fakeStaffCredential({
        id: 'scd_01J9Z4C8D1E2F3G4H5J6K7M8NR',
        staffUserId: OPERATOR_ID,
        username: 'operator.one',
        ...(options.credential === undefined ? {} : options.credential),
      }),
      fakeStaffCredential({
        id: 'scd_01J9Z4C8D1E2F3G4H5J6K7M8NS',
        staffUserId: TARGET_ID,
        username: 'b.adebayo',
        ...(options.credential === undefined ? {} : options.credential),
      }),
    ],
  });
}

/** Opens two live sessions for the target, as a lost handset would leave behind. */
async function giveTargetSessions(harness: IdentityHarness): Promise<void> {
  for (const index of [1, 2]) {
    await harness.ports.staffSessions.create({
      staffId: TARGET_ID,
      at: FAKE_NOW,
      expiresAt: `2026-11-18T09:${String(index + 10).padStart(2, '0')}:00Z`,
      absoluteExpiresAt: '2026-11-18T17:00:00Z',
    });
  }
}

describe('resetStaffCredential', () => {
  it('replaces the password and second factor, ends every session and audits the operator', async () => {
    const harness = harnessWithTarget();
    await giveTargetSessions(harness);
    const deps = depsFor(harness);

    const result = await resetStaffCredential(operatorCaller(), deps, {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.staffUser).toEqual({
      id: TARGET_ID,
      fullName: 'B. Adebayo',
      role: 'response_staff',
      external: false,
      secondFactorEnrolled: false,
      active: true,
    });
    expect(result.credential).toEqual({
      passwordChangedAt: FAKE_NOW,
      secondFactorEnrolledAt: null,
      failedAttemptCount: 0,
      lockedUntil: null,
    });
    expect(result.sessionsEnded).toBe(2);
    expect(result.nextStep).toBe('re_enrol');

    // The credential is in the end state: new password, no factor, no recovery codes, no lock.
    const stored = harness.credentials.find((row) => row.staffUserId === TARGET_ID);
    expect(stored?.password).toBe(NEW_PASSWORD);
    expect(stored?.enrolledAt).toBeUndefined();
    expect(stored?.recoveryCodes).toEqual([]);
    expect(stored?.failedAttemptCount).toBe(0);
    expect(stored?.lockedUntil).toBeUndefined();
    expect(harness.staff.find((row) => row.id === TARGET_ID)?.secondFactorEnrolled).toBe(false);

    // Every session the target held is gone, and the operator's own session is untouched.
    for (const [sessionId, session] of harness.staffSessions) {
      if (session.staffId !== TARGET_ID) continue;
      await expect(harness.ports.staffSessions.read(sessionId)).resolves.toBeNull();
    }
    expect(harness.endedSessionIds.size).toBe(2);

    // One audit row: the operator, the target, the time and the reason — and no secret.
    expect(harness.audit).toHaveLength(1);
    expect(harness.audit[0]).toMatchObject({
      actorId: OPERATOR_ID,
      actorRole: 'operator',
      action: 'staff.credential_reset',
      entityType: 'StaffUser',
      entityId: TARGET_ID,
      reason: REASON,
      occurredAt: FAKE_NOW,
    });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(NEW_PASSWORD);
    expect(serialised).not.toContain(FAKE_PASSWORD);
    expect(serialised).not.toContain(harness.credentials[1]?.recoveryCodes[0]?.code ?? 'unused');
  });

  it('leaves an inactive account inactive', async () => {
    const harness = harnessWithTarget({ target: { active: false } });
    const result = await resetStaffCredential(operatorCaller(), depsFor(harness), {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-inactive',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.staffUser.active).toBe(false);
    expect(harness.staff.find((row) => row.id === TARGET_ID)?.active).toBe(false);
  });

  it('refuses a self-reset, applies nothing and records the refused attempt', async () => {
    const harness = harnessWithTarget();
    const result = await resetStaffCredential(operatorCaller(), depsFor(harness), {
      staffUserId: OPERATOR_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-self',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'POLICY_VIOLATION',
      cause: 'SELF_RESET_REQUIRES_SECOND_OPERATOR',
    });
    expect(harness.credentials[0]?.password).toBe(FAKE_PASSWORD);
    expect(harness.audit).toHaveLength(1);
    expect(harness.audit[0]).toMatchObject({
      actorId: OPERATOR_ID,
      action: 'staff.credential_reset_refused',
      entityId: OPERATOR_ID,
      reason: 'SELF_RESET_REQUIRES_SECOND_OPERATOR',
    });
  });

  it('refuses a non-operator role and records the refusal', async () => {
    const harness = harnessWithTarget();
    const responseStaff = operatorCaller({ role: 'response_staff', staffId: TARGET_ID });

    const result = await resetStaffCredential(responseStaff, depsFor(harness), {
      staffUserId: OPERATOR_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-role',
    });

    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE', cause: 'OPERATOR_REQUIRED' });
    expect(harness.credentials[0]?.password).toBe(FAKE_PASSWORD);
    expect(harness.audit.at(-1)).toMatchObject({
      actorId: TARGET_ID,
      actorRole: 'response_staff',
      action: 'staff.credential_reset_refused',
      reason: 'OPERATOR_REQUIRED',
    });
  });

  it('refuses an operator whose second factor is not satisfied', async () => {
    const harness = harnessWithTarget();
    const caller = operatorCaller({ secondFactorSatisfied: false });

    const result = await resetStaffCredential(caller, depsFor(harness), {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-factor',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'SECOND_FACTOR_REQUIRED',
    });
    expect(harness.credentials[1]?.password).toBe(FAKE_PASSWORD);
    expect(harness.audit.at(-1)).toMatchObject({
      action: 'staff.credential_reset_refused',
      reason: 'SECOND_FACTOR_REQUIRED',
    });
  });

  it('writes once for a replay under the same key', async () => {
    const harness = harnessWithTarget();
    await giveTargetSessions(harness);
    const deps = depsFor(harness);
    const request = {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-replay',
    };

    const first = await resetStaffCredential(operatorCaller(), deps, request);
    const second = await resetStaffCredential(operatorCaller(), deps, request);

    expect(second).toEqual(first);
    expect(harness.audit).toHaveLength(1);
    expect(harness.endedSessionIds.size).toBe(2);
  });

  it('neither refuses nor doubles a repeat under a new key', async () => {
    const harness = harnessWithTarget();
    await giveTargetSessions(harness);
    const deps = depsFor(harness);

    const first = await resetStaffCredential(operatorCaller(), deps, {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-first',
    });
    const repeat = await resetStaffCredential(operatorCaller(), deps, {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-second',
    });

    expect(first.ok).toBe(true);
    expect(repeat.ok).toBe(true);
    if (!first.ok || !repeat.ok) return;
    expect(first.sessionsEnded).toBe(2);
    expect(repeat.sessionsEnded).toBe(0);
    // Each call has its own audit row; neither is a refusal.
    expect(harness.audit.map((row) => row.action)).toEqual([
      'staff.credential_reset',
      'staff.credential_reset',
    ]);
  });

  it('refuses a password the enrolled credential already uses', async () => {
    const harness = harnessWithTarget();
    const result = await resetStaffCredential(operatorCaller(), depsFor(harness), {
      staffUserId: TARGET_ID,
      newPassword: FAKE_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-same',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { newPassword: 'ALREADY_SET' },
    });
    expect(harness.credentials[1]?.password).toBe(FAKE_PASSWORD);
    expect(harness.audit.at(-1)).toMatchObject({ reason: 'PASSWORD_ALREADY_SET' });
  });

  it('validates the target, the password, the reason and the key', async () => {
    const harness = harnessWithTarget();
    const result = await resetStaffCredential(operatorCaller(), depsFor(harness), {
      staffUserId: 'not-an-identifier',
      newPassword: 'short',
      reason: '   ',
      idempotencyKey: '',
    });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    if (result.ok) return;
    expect(result.fields).toEqual({
      staffUserId: 'PATTERN_MISMATCH',
      newPassword: 'TOO_SHORT',
      reason: 'REQUIRED',
      'Idempotency-Key': 'REQUIRED',
    });
    // A malformed payload never reaches the credential store or the audit log.
    expect(harness.audit).toHaveLength(0);
  });

  it('refuses a reason that reproduces the new password', async () => {
    const harness = harnessWithTarget();
    const result = await resetStaffCredential(operatorCaller(), depsFor(harness), {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: `Handed over ${NEW_PASSWORD} in person.`,
      idempotencyKey: 'reset-key-reason-secret',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { reason: 'PATTERN_MISMATCH' },
    });
    expect(harness.credentials[1]?.password).toBe(FAKE_PASSWORD);
    expect(harness.audit).toHaveLength(0);
  });

  it('answers NOT_FOUND when the staff account or its credential does not exist', async () => {
    const harness = harnessWithTarget();
    const deps = depsFor(harness);

    const missingStaff = await resetStaffCredential(operatorCaller(), deps, {
      staffUserId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NX',
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-missing',
    });
    expect(missingStaff).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      cause: 'STAFF_USER_NOT_FOUND',
    });

    // A staff user whose credential was never provisioned is not a reset target either.
    harness.staff.push(fakeStaffUser({ id: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NW', fullName: 'C. Oke' }));
    const missingCredential = await resetStaffCredential(operatorCaller(), deps, {
      staffUserId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NW',
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-no-credential',
    });
    expect(missingCredential).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
      cause: 'STAFF_CREDENTIAL_NOT_FOUND',
    });
  });

  it('refuses when the limiter is exhausted and records the attempt', async () => {
    const harness = createIdentityHarness({
      staff: [
        fakeStaffUser({ id: OPERATOR_ID, fullName: 'Campaign Operator', role: 'operator' }),
        fakeStaffUser({ id: TARGET_ID, fullName: 'B. Adebayo', role: 'response_staff' }),
      ],
      credentials: [
        fakeStaffCredential({
          id: 'scd_01J9Z4C8D1E2F3G4H5J6K7M8NR',
          staffUserId: OPERATOR_ID,
          username: 'operator.one',
        }),
        fakeStaffCredential({
          id: 'scd_01J9Z4C8D1E2F3G4H5J6K7M8NS',
          staffUserId: TARGET_ID,
          username: 'b.adebayo',
        }),
      ],
      rateLimited: { retryAfterSeconds: 30 },
    });

    const result = await resetStaffCredential(operatorCaller(), depsFor(harness), {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-limited',
    });

    expect(result).toMatchObject({
      ok: false,
      code: 'RATE_LIMITED',
      cause: 'STAFF_CREDENTIAL_RESET_RATE_LIMITED',
      retryAfterSeconds: 30,
    });
    expect(harness.credentials[1]?.password).toBe(FAKE_PASSWORD);
    expect(harness.audit.at(-1)).toMatchObject({
      action: 'staff.credential_reset_refused',
      reason: 'STAFF_CREDENTIAL_RESET_RATE_LIMITED',
    });
  });

  it('fails the write when the audit log refuses the record', async () => {
    const harness = harnessWithTarget();
    const deps = depsFor(harness);
    // Replace the audit port with one that refuses, keeping every other effect real.
    const refusing: ResetStaffCredentialDeps = {
      ...deps,
      audit: {
        async append() {
          throw new Error('the audit log is unavailable');
        },
      },
    };

    const result = await resetStaffCredential(operatorCaller(), refusing, {
      staffUserId: TARGET_ID,
      newPassword: NEW_PASSWORD,
      reason: REASON,
      idempotencyKey: 'reset-key-audit',
    });

    expect(result).toMatchObject({ ok: false, code: 'SERVICE_DEGRADED' });
  });
});

describe('readStaffResetTargets', () => {
  it('lists the credentialed staff accounts for the operator', async () => {
    const harness = harnessWithTarget();
    const result = await readStaffResetTargets(operatorCaller(), { reset: resetStore(harness) });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targets).toEqual([
      {
        staffUserId: OPERATOR_ID,
        fullName: 'Campaign Operator',
        role: 'operator',
        active: true,
        secondFactorEnrolled: true,
      },
      {
        staffUserId: TARGET_ID,
        fullName: 'B. Adebayo',
        role: 'response_staff',
        active: true,
        secondFactorEnrolled: true,
      },
    ]);
  });

  it('refuses the list to every role but the operator, and to an unsatisfied factor', async () => {
    const harness = harnessWithTarget();
    const deps = { reset: resetStore(harness) };

    expect(
      await readStaffResetTargets(
        operatorCaller({ role: 'response_staff', staffId: TARGET_ID }),
        deps,
      ),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE', cause: 'OPERATOR_REQUIRED' });
    expect(
      await readStaffResetTargets(operatorCaller({ secondFactorSatisfied: false }), deps),
    ).toMatchObject({ ok: false, code: 'UNAUTHENTICATED', cause: 'SECOND_FACTOR_REQUIRED' });
    expect(
      await readStaffResetTargets(
        { kind: 'member', memberId: 'mbr_01J9Z4C8D1E2F3G4H5J6K7M8NV', sessionId: 'ses_member' },
        deps,
      ),
    ).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE', cause: 'MEMBER_SESSION_PRESENT' });
  });
});
