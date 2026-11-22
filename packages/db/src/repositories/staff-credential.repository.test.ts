/**
 * The staff credential repository (`schema.md` StaffCredential, `C-092`, `C-093`).
 *
 * The suite runs against a disposable PostgreSQL 16 database and proves the rules the persistence layer
 * carries: a credential is found by username and by staff user without ever handing back a hash, a
 * failure counts and locks at the `C-092` threshold, a lapsed lock restarts the count, the second
 * factor is stored sealed with only recovery-code digests, and a recovery code can be spent exactly
 * once.
 *
 * The credential-material adapters are replaced here by deterministic doubles: Argon2id, AES-256-GCM
 * and the TOTP arithmetic are proved in `@odp/platform`, and this suite is about the SQL and the
 * projection. The doubles keep the same shape, so a change to the port breaks compilation.
 */
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { SecondFactorPort } from '../../../domain/src/ports/password.ts';
import { staffCredential } from '../schema/staff-credential.ts';
import { staffUser } from '../schema/staff-user.ts';
import {
  createStaffCredentialRepository,
  type StaffCredentialSeams,
} from './staff-credential.repository.ts';
import {
  T0,
  createStaffUser,
  createTestDatabase,
  testId,
  type TestDatabaseClient,
} from '../testing/index.ts';

/** The password the double hasher accepts, and the hash prefix it stores. */
const PASSWORD = 'market-lantern-river-2026';

/** How the double seals a secret: reversible base64 so the test can prove the stored value differs. */
const SEAL_PREFIX = 'sealed.';

/** Build the deterministic credential-material doubles, plus the counters a test may assert on. */
function doubles(): {
  seams: StaffCredentialSeams;
  hashPassword: (password: string) => string;
  sealedSecret: (secret: string) => string;
  noCredentialComparisons: () => number;
} {
  let comparisons = 0;
  const hashPassword = (password: string): string => `test$${password}`;
  const secondFactor: SecondFactorPort = {
    generateSecret: () => 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
    otpauthUri: ({ issuer, account, secret }) =>
      `otpauth://totp/${issuer}:${account}?secret=${secret}`,
    verifyCode: ({ code }) => code === '492013',
    generateRecoveryCodes: (count) =>
      Array.from({ length: count }, (_, index) => `CODE-${String(index).padStart(4, '0')}`),
    hashRecoveryCode: (code) => createHash('sha256').update(code).digest('hex'),
  };

  return {
    seams: {
      hasher: {
        async hash(password) {
          return hashPassword(password);
        },
        async verify(hash, password) {
          return hash === hashPassword(password);
        },
        async verifyWithoutCredential() {
          comparisons += 1;
        },
      },
      cipher: {
        seal(secret) {
          return `${SEAL_PREFIX}${Buffer.from(secret, 'utf8').toString('base64')}`;
        },
        open(sealed) {
          if (!sealed.startsWith(SEAL_PREFIX)) throw new Error('unexpected seal');
          return Buffer.from(sealed.slice(SEAL_PREFIX.length), 'base64').toString('utf8');
        },
      },
      secondFactor,
    },
    hashPassword,
    sealedSecret: (secret) => `${SEAL_PREFIX}${Buffer.from(secret, 'utf8').toString('base64')}`,
    noCredentialComparisons: () => comparisons,
  };
}

/** Insert one credential row for a fresh staff user and return both identifiers. */
async function insertCredential(
  db: TestDatabaseClient,
  overrides: {
    readonly passwordHash: string;
    readonly username?: string;
    readonly failedAttemptCount?: number;
    readonly lockedUntil?: string | null;
    /** The staff user to attach to, when the test already created one. */
    readonly staffId?: string;
  },
): Promise<{ staffId: string; credentialId: string }> {
  const staffId = overrides.staffId ?? (await createStaffUser(db));
  const credentialId = testId('scd');
  await db.insert(staffCredential).values({
    id: credentialId,
    staffUserId: staffId,
    username: overrides.username ?? 'a.balogun',
    passwordHash: overrides.passwordHash,
    passwordChangedAt: T0,
    totpSecretEncrypted: null,
    secondFactorEnrolledAt: null,
    recoveryCodes: [],
    failedAttemptCount: overrides.failedAttemptCount ?? 0,
    lockedUntil: overrides.lockedUntil ?? null,
    lastSignInAt: null,
    createdAt: T0,
  });
  return { staffId, credentialId };
}

describe('staff credential repository', () => {
  it('finds a credential by username and by staff user without returning a hash', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { staffId, credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
        username: 'a.balogun',
      });

      const byUsername = await repository.findByUsername('a.balogun');
      expect(byUsername).toMatchObject({
        id: credentialId,
        staffUserId: staffId,
        username: 'a.balogun',
      });
      expect(byUsername).not.toHaveProperty('passwordHash');
      expect(byUsername).not.toHaveProperty('totpSecretEncrypted');

      expect((await repository.findByStaffUserId(staffId))?.id).toBe(credentialId);
      expect(await repository.findByUsername('unknown.user')).toBeNull();
      expect(await repository.findByStaffUserId(testId('stf'))).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('compares a password, and does the same work when no credential matched', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword, noCredentialComparisons } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
      });

      expect(await repository.verifyPassword(credentialId, PASSWORD)).toBe(true);
      expect(await repository.verifyPassword(credentialId, 'harbour-lantern-quiet-2026')).toBe(
        false,
      );

      // C-092: an unknown username and a wrong password must be indistinguishable, so the no-credential
      // comparison runs rather than returning early.
      expect(await repository.verifyPassword(null, PASSWORD)).toBe(false);
      expect(noCredentialComparisons()).toBe(1);
      expect(await repository.verifyPassword(testId('scd'), PASSWORD)).toBe(false);
      expect(noCredentialComparisons()).toBe(2);
    } finally {
      await database.dispose();
    }
  });

  it('counts failures, locks at the C-092 threshold and restarts when the lock lapses', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
      });

      const rule = { lockAttemptLimit: 5, lockWindowSeconds: 900, lockSeconds: 1800 };

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const failure = await repository.recordFailure(credentialId, {
          at: `2026-11-18T09:0${attempt}:00Z`,
          ...rule,
        });
        expect(failure.failedAttemptCount).toBe(attempt);
        expect(failure.lockedUntil).toBeUndefined();
      }

      const fifth = await repository.recordFailure(credentialId, {
        at: '2026-11-18T09:05:00Z',
        ...rule,
      });
      expect(fifth.failedAttemptCount).toBe(5);
      expect(fifth.lockedUntil).toBe('2026-11-18T09:35:00Z');

      // The next failure arrives after the lock lapsed: the count starts again rather than continuing.
      const afterLapse = await repository.recordFailure(credentialId, {
        at: '2026-11-18T09:36:00Z',
        ...rule,
      });
      expect(afterLapse.failedAttemptCount).toBe(1);
      expect(afterLapse.lockedUntil).toBeUndefined();
    } finally {
      await database.dispose();
    }
  });

  it('clears failures and records a successful sign-in instant', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
        failedAttemptCount: 4,
        lockedUntil: '2026-11-18T09:35:00Z',
      });

      await repository.recordSignIn(credentialId, '2026-11-18T09:20:00Z');
      expect((await repository.findByUsername('a.balogun'))?.lastSignInAt).toBe(
        '2026-11-18T09:20:00Z',
      );

      await repository.clearFailures(credentialId, '2026-11-18T09:20:00Z');
      const cleared = await repository.findByUsername('a.balogun');
      expect(cleared?.failedAttemptCount).toBe(0);
      expect(cleared?.lockedUntil).toBeUndefined();
    } finally {
      await database.dispose();
    }
  });

  it('enrols the second factor sealed, then stores only recovery-code digests', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword, sealedSecret } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
      });

      const beginning = await repository.beginTotpEnrolment(credentialId, {
        username: 'a.balogun',
        issuer: 'Oyo Digital Parliament',
        algorithm: 'SHA1',
        digits: 6,
        periodSeconds: 30,
      });
      expect(beginning.secret).toBe('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP');
      expect(beginning.otpauthUri).toContain('otpauth://totp/Oyo Digital Parliament:a.balogun');

      const [storedAfterBegin] = await database.db
        .select()
        .from(staffCredential)
        .where(eq(staffCredential.id, credentialId));
      expect(storedAfterBegin?.totpSecretEncrypted).toBe(sealedSecret(beginning.secret));
      expect(storedAfterBegin?.totpSecretEncrypted).not.toBe(beginning.secret);

      // A wrong code proves nothing and issues nothing.
      expect(
        await repository.completeTotpEnrolment(credentialId, {
          code: '000000',
          at: '2026-11-18T09:20:00Z',
          digits: 6,
          periodSeconds: 30,
          windowSteps: 1,
          recoveryCodeCount: 10,
        }),
      ).toEqual({ verified: false });
      expect(
        (await repository.findByStaffUserId(storedAfterBegin?.staffUserId ?? ''))?.recoveryCodes,
      ).toEqual([]);

      const completed = await repository.completeTotpEnrolment(credentialId, {
        code: '492013',
        at: '2026-11-18T09:20:00Z',
        digits: 6,
        periodSeconds: 30,
        windowSteps: 1,
        recoveryCodeCount: 10,
      });
      expect(completed.verified).toBe(true);
      if (!completed.verified) return;
      expect(completed.enrolledAt).toBe('2026-11-18T09:20:00Z');
      expect(completed.recoveryCodes).toHaveLength(10);

      const [storedAfterEnrolment] = await database.db
        .select()
        .from(staffCredential)
        .where(eq(staffCredential.id, credentialId));
      expect(storedAfterEnrolment?.secondFactorEnrolledAt).toBe('2026-11-18T09:20:00Z');
      // The plaintext codes are returned once and never stored: only digests are written.
      const serialised = JSON.stringify(storedAfterEnrolment?.recoveryCodes);
      for (const code of completed.recoveryCodes) expect(serialised).not.toContain(code);
      expect(storedAfterEnrolment?.recoveryCodes).toHaveLength(10);
      for (const entry of storedAfterEnrolment?.recoveryCodes ?? []) {
        expect(entry.codeHash).toMatch(/^[0-9a-f]{64}$/);
        expect(entry.usedAt).toBeUndefined();
      }
    } finally {
      await database.dispose();
    }
  });

  it('verifies a time-based code against the enrolled secret', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
      });

      const parameters = { digits: 6, periodSeconds: 30, windowSteps: 1 };
      // Nothing enrolled yet: no secret can match.
      expect(
        await repository.verifyTotp(credentialId, { ...parameters, code: '492013', at: T0 }),
      ).toBe(false);

      await repository.beginTotpEnrolment(credentialId, {
        username: 'a.balogun',
        issuer: 'Oyo Digital Parliament',
        algorithm: 'SHA1',
        digits: 6,
        periodSeconds: 30,
      });

      expect(
        await repository.verifyTotp(credentialId, { ...parameters, code: '492013', at: T0 }),
      ).toBe(true);
      expect(
        await repository.verifyTotp(credentialId, { ...parameters, code: '000000', at: T0 }),
      ).toBe(false);
    } finally {
      await database.dispose();
    }
  });

  it('spends a recovery code exactly once and reports an unknown one as absent', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
      });

      await repository.beginTotpEnrolment(credentialId, {
        username: 'a.balogun',
        issuer: 'Oyo Digital Parliament',
        algorithm: 'SHA1',
        digits: 6,
        periodSeconds: 30,
      });
      const completed = await repository.completeTotpEnrolment(credentialId, {
        code: '492013',
        at: '2026-11-18T09:20:00Z',
        digits: 6,
        periodSeconds: 30,
        windowSteps: 1,
        recoveryCodeCount: 10,
      });
      if (!completed.verified) throw new Error('enrolment did not complete');

      const first = completed.recoveryCodes[0] ?? '';
      expect(await repository.verifyRecoveryCode(credentialId, first)).toEqual({
        index: 0,
        spent: false,
      });
      expect(await repository.verifyRecoveryCode(credentialId, 'NOT-A-REAL-CODE')).toBeNull();

      expect(await repository.spendRecoveryCode(credentialId, 0, '2026-11-18T09:30:00Z')).toBe(
        true,
      );
      expect(await repository.verifyRecoveryCode(credentialId, first)).toEqual({
        index: 0,
        spent: true,
      });

      // A second spend of the same code is refused: one code admits one session.
      expect(await repository.spendRecoveryCode(credentialId, 0, '2026-11-18T09:31:00Z')).toBe(
        false,
      );
      // An index outside the batch is refused rather than appended to the array.
      expect(await repository.spendRecoveryCode(credentialId, 99, '2026-11-18T09:31:00Z')).toBe(
        false,
      );
      expect((await repository.findByUsername('a.balogun'))?.recoveryCodes).toHaveLength(10);
    } finally {
      await database.dispose();
    }
  });

  it('holds one credential per staff user and one account per username', async () => {
    const database = await createTestDatabase();
    try {
      const { hashPassword } = doubles();
      const { staffId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
      });

      // A second credential for the same staff user is refused (schema.md: exactly one).
      await expect(
        database.db.insert(staffCredential).values({
          id: testId('scd'),
          staffUserId: staffId,
          username: 'b.adebayo',
          passwordHash: hashPassword(PASSWORD),
          passwordChangedAt: T0,
          totpSecretEncrypted: null,
          secondFactorEnrolledAt: null,
          recoveryCodes: [],
          failedAttemptCount: 0,
          lockedUntil: null,
          lastSignInAt: null,
          createdAt: T0,
        }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });

      // A second credential claiming the same username is refused as well.
      const otherStaffId = await createStaffUser(database.db);
      await expect(
        database.db.insert(staffCredential).values({
          id: testId('scd'),
          staffUserId: otherStaffId,
          username: 'a.balogun',
          passwordHash: hashPassword(PASSWORD),
          passwordChangedAt: T0,
          totpSecretEncrypted: null,
          secondFactorEnrolledAt: null,
          recoveryCodes: [],
          failedAttemptCount: 0,
          lockedUntil: null,
          lastSignInAt: null,
          createdAt: T0,
        }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });

      // A credential with no staff user is refused by the foreign key, not cleaned up by the app.
      await expect(
        database.db.insert(staffCredential).values({
          id: testId('scd'),
          staffUserId: testId('stf'),
          username: 'c.oke',
          passwordHash: hashPassword(PASSWORD),
          passwordChangedAt: T0,
          totpSecretEncrypted: null,
          secondFactorEnrolledAt: null,
          recoveryCodes: [],
          failedAttemptCount: 0,
          lockedUntil: null,
          lastSignInAt: null,
          createdAt: T0,
        }),
      ).rejects.toMatchObject({ cause: { code: '23503' } });
    } finally {
      await database.dispose();
    }
  });

  it('lists the credentialed staff accounts the operator may reset', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);

      const operatorId = await createStaffUser(database.db, {
        fullName: 'Campaign Operator',
        role: 'operator',
      });
      const targetId = await createStaffUser(database.db, {
        fullName: 'B. Adebayo',
        role: 'response_staff',
      });
      // An account with no credential is not a reset target: C-093 refuses a reset whose credential
      // does not exist, so the panel must not offer one.
      await createStaffUser(database.db, { fullName: 'C. Oke', role: 'moderator' });

      await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
        username: 'operator.one',
        staffId: operatorId,
      });
      await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
        username: 'b.adebayo',
        staffId: targetId,
      });

      expect(await repository.listResetTargets()).toEqual([
        {
          staffUserId: targetId,
          fullName: 'B. Adebayo',
          role: 'response_staff',
          active: true,
          secondFactorEnrolled: true,
        },
        {
          staffUserId: operatorId,
          fullName: 'Campaign Operator',
          role: 'operator',
          active: true,
          secondFactorEnrolled: true,
        },
      ]);

      // The active state and the factor status are the staff record's, so the panel states follow it.
      await database.db
        .update(staffUser)
        .set({ active: false, secondFactorEnrolled: false })
        .where(eq(staffUser.id, targetId));
      const [deactivated] = await repository.listResetTargets();
      expect(deactivated?.staffUserId).toBe(targetId);
      expect(deactivated?.active).toBe(false);
      expect(deactivated?.secondFactorEnrolled).toBe(false);
    } finally {
      await database.dispose();
    }
  });

  it('resets a credential to the C-093 end state without returning a secret', async () => {
    const database = await createTestDatabase();
    try {
      const { seams, hashPassword } = doubles();
      const repository = createStaffCredentialRepository(database.db, seams);
      const { staffId, credentialId } = await insertCredential(database.db, {
        passwordHash: hashPassword(PASSWORD),
        failedAttemptCount: 4,
        lockedUntil: '2026-11-18T09:35:00Z',
      });
      // Enrol the factor so the reset has something to clear.
      await database.db
        .update(staffCredential)
        .set({
          totpSecretEncrypted: 'sealed.secret',
          secondFactorEnrolledAt: T0,
          recoveryCodes: [{ codeHash: 'a'.repeat(64) }],
        })
        .where(eq(staffCredential.id, credentialId));

      const NEW_PASSWORD = 'harbour-lantern-quiet-2026';
      const reset = await repository.resetCredential({
        credentialId,
        newPassword: NEW_PASSWORD,
        at: '2026-11-18T10:00:00Z',
      });

      expect(reset).toMatchObject({
        id: credentialId,
        staffUserId: staffId,
        passwordChangedAt: '2026-11-18T10:00:00Z',
        failedAttemptCount: 0,
        recoveryCodes: [],
      });
      expect(reset.secondFactorEnrolledAt).toBeUndefined();
      expect(reset.lockedUntil).toBeUndefined();
      expect(reset).not.toHaveProperty('passwordHash');
      expect(reset).not.toHaveProperty('totpSecretEncrypted');

      const [stored] = await database.db
        .select()
        .from(staffCredential)
        .where(eq(staffCredential.id, credentialId));
      expect(stored?.passwordHash).toBe(hashPassword(NEW_PASSWORD));
      expect(stored?.passwordHash).not.toBe(hashPassword(PASSWORD));
      expect(stored?.totpSecretEncrypted).toBeNull();
      expect(stored?.secondFactorEnrolledAt).toBeNull();
      expect(stored?.recoveryCodes).toEqual([]);
      expect(stored?.failedAttemptCount).toBe(0);
      expect(stored?.lockedUntil).toBeNull();
      // The new password is the one the sign-in path now accepts.
      expect(await repository.verifyPassword(credentialId, NEW_PASSWORD)).toBe(true);
      expect(await repository.verifyPassword(credentialId, PASSWORD)).toBe(false);

      await expect(
        repository.resetCredential({
          credentialId: testId('scd'),
          newPassword: NEW_PASSWORD,
          at: '2026-11-18T10:00:00Z',
        }),
      ).rejects.toThrow('the credential to reset is gone');
    } finally {
      await database.dispose();
    }
  });
});
