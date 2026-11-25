/**
 * The first staff accounts and both staff credentials (`operations.md` Staff sign-in, ADR-004,
 * `C-092`, `C-055`, `NFR-021`).
 *
 * The suite proves the four properties the seed must hold: on a clean deployment each account gets a
 * credential whose stored value is the hasher's output and never the plaintext; a deployment with a
 * missing or unusable secret fails before it writes anything; a later reseed never replaces a
 * credential that has since been reset; and both credentials are written unenrolled, so the second
 * factor is the staff member's enrolment through `C-092` rather than something the seed invents.
 *
 * The hasher is a tagged double, so the stored values are inspectable without a real Argon2id call.
 * The adapter's own suite proves the algorithm; this one proves the seed stores only what it returns,
 * once per deployment secret.
 */
import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCredentialAdapters } from '@odp/platform';
import { staffCredential } from '../schema/staff-credential.ts';
import { staffUser } from '../schema/staff-user.ts';
import { createTestDatabase, type TestDatabase } from '../testing/index.ts';
import {
  OPERATOR_ID,
  OPERATOR_USERNAME,
  RESPONSE_STAFF_ID,
  RESPONSE_STAFF_USERNAME,
  SeedConfigurationError,
  seedStaff,
  staffSeedRows,
  type SeedPasswordHasher,
  type StaffSeedOptions,
} from './staff.ts';

/** `C-092`'s floor, so the tags below are usable secrets rather than rejected ones. */
const OPERATOR_PASSWORD = 'seed-suite-operator-password';
const RESPONSE_PASSWORD = 'seed-suite-response-password';

interface TaggedHasher {
  readonly calls: string[];
  readonly hasher: SeedPasswordHasher;
}

/** A hasher that records what it was asked to hash and returns a numbered tag instead of the password. */
function taggedHasher(tag: string): TaggedHasher {
  const calls: string[] = [];
  return {
    calls,
    hasher: {
      async hash(password: string): Promise<string> {
        calls.push(password);
        return `test-argon2id$${tag}:${calls.length}`;
      },
    },
  };
}

function optionsFor(
  tag: string,
  operatorPassword: string | null = OPERATOR_PASSWORD,
  responsePassword: string | null = RESPONSE_PASSWORD,
): {
  readonly calls: string[];
  readonly options: StaffSeedOptions;
} {
  const { calls, hasher } = taggedHasher(tag);
  return {
    calls,
    options: {
      hasher,
      operatorInitialPassword: operatorPassword,
      responseStaffInitialPassword: responsePassword,
    },
  };
}

/** The number of rows in one table, as a number: `count()` comes back as a string. */
async function rowCount(
  database: TestDatabase,
  table: typeof staffUser | typeof staffCredential,
): Promise<number> {
  const rows = await database.db.select({ value: count() }).from(table);
  return Number(rows[0]?.value ?? 0);
}

/** One staff user's credential rows, in a stable order. */
async function credentialsFor(
  database: TestDatabase,
  staffUserId: string,
): Promise<readonly (typeof staffCredential.$inferSelect)[]> {
  return database.db
    .select()
    .from(staffCredential)
    .where(eq(staffCredential.staffUserId, staffUserId));
}

describe('first staff seed', () => {
  it('seeds both accounts and both credentials from their own deployment secrets', async () => {
    const database = await createTestDatabase();
    try {
      const { calls, options } = optionsFor('first');

      const result = await seedStaff(database.db, options);

      expect(result).toEqual({
        inserted: 2,
        existing: 0,
        operatorCredentialProvisioned: true,
        responseStaffCredentialProvisioned: true,
      });
      // One hashing call per secret, in the order the seed declares the two credentials.
      expect(calls).toEqual([OPERATOR_PASSWORD, RESPONSE_PASSWORD]);

      const staff = await database.db.select().from(staffUser).orderBy(staffUser.id);
      expect(staff).toHaveLength(2);
      expect(staff.map((row) => row.role).sort()).toEqual(['operator', 'response_staff']);
      // C-092: enrolment is the staff member's, so neither seeded account arrives enrolled.
      expect(staff.every((row) => row.secondFactorEnrolled === false)).toBe(true);
      expect(staff.map((row) => row.id).sort()).toEqual([OPERATOR_ID, RESPONSE_STAFF_ID].sort());
      expect(staff.find((row) => row.id === RESPONSE_STAFF_ID)?.role).toBe('response_staff');

      const operator = await credentialsFor(database, OPERATOR_ID);
      expect(operator).toHaveLength(1);
      const operatorCredential = operator[0];
      expect(operatorCredential).toBeDefined();
      if (operatorCredential === undefined) return;

      expect(operatorCredential.username).toBe(OPERATOR_USERNAME);
      expect(operatorCredential.passwordHash).toBe('test-argon2id$first:1');
      expect(operatorCredential.passwordHash).not.toBe(OPERATOR_PASSWORD);

      const response = await credentialsFor(database, RESPONSE_STAFF_ID);
      expect(response).toHaveLength(1);
      const responseCredential = response[0];
      expect(responseCredential).toBeDefined();
      if (responseCredential === undefined) return;

      expect(responseCredential.username).toBe(RESPONSE_STAFF_USERNAME);
      expect(responseCredential.passwordHash).toBe('test-argon2id$first:2');
      expect(responseCredential.passwordHash).not.toBe(RESPONSE_PASSWORD);
      // Two deployment secrets, two hashes: one account's password never stands in for the other's.
      expect(responseCredential.passwordHash).not.toBe(operatorCredential.passwordHash);

      for (const credential of [operatorCredential, responseCredential]) {
        expect(credential.id).toMatch(/^scd_[0-9A-Z]{4,26}$/);
        expect(credential.passwordChangedAt).toBe('2026-11-01T00:00:00Z');
        // The second factor is the staff member's to enrol through C-092; the seed never invents one.
        expect(credential.totpSecretEncrypted).toBeNull();
        expect(credential.secondFactorEnrolledAt).toBeNull();
        expect(credential.recoveryCodes).toEqual([]);
        expect(credential.failedAttemptCount).toBe(0);
        expect(credential.lockedUntil).toBeNull();
        expect(credential.lastSignInAt).toBeNull();
      }
    } finally {
      await database.dispose();
    }
  });

  it('refuses a clean database with no operator secret and writes nothing', async () => {
    const database = await createTestDatabase();
    try {
      const { options } = optionsFor('first', null);

      const error: unknown = await seedStaff(database.db, options).catch(
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(SeedConfigurationError);
      expect((error as Error).message).toContain('STAFF_OPERATOR_INITIAL_PASSWORD');

      expect(await rowCount(database, staffUser)).toBe(0);
      expect(await rowCount(database, staffCredential)).toBe(0);
    } finally {
      await database.dispose();
    }
  });

  it('refuses a clean database with no response-staff secret and writes nothing', async () => {
    const database = await createTestDatabase();
    try {
      const { options } = optionsFor('first', OPERATOR_PASSWORD, null);

      const error: unknown = await seedStaff(database.db, options).catch(
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(SeedConfigurationError);
      expect((error as Error).message).toContain('STAFF_RESPONSE_STAFF_INITIAL_PASSWORD');

      // The operator's secret is present, yet no account and no credential is written: the refusal
      // happens before the first insert rather than halfway through the pair.
      expect(await rowCount(database, staffUser)).toBe(0);
      expect(await rowCount(database, staffCredential)).toBe(0);
    } finally {
      await database.dispose();
    }
  });

  it('refuses a secret the sign-in rules could never accept and names the rule, not the value', async () => {
    const database = await createTestDatabase();
    try {
      const { options } = optionsFor('first', OPERATOR_PASSWORD, 'too-short');

      const error: unknown = await seedStaff(database.db, options).catch(
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(SeedConfigurationError);
      expect((error as Error).message).toContain('STAFF_RESPONSE_STAFF_INITIAL_PASSWORD');
      expect((error as Error).message).toMatch(/12 to 128 characters/);
      expect((error as Error).message).not.toContain('too-short');

      expect(await rowCount(database, staffUser)).toBe(0);
      expect(await rowCount(database, staffCredential)).toBe(0);
    } finally {
      await database.dispose();
    }
  });

  it('writes each credential once and never replaces either on a reseed', async () => {
    const database = await createTestDatabase();
    try {
      const first = optionsFor('first');
      const second = optionsFor(
        'second',
        'a-different-operator-password',
        'a-different-staff-password',
      );

      await seedStaff(database.db, first.options);
      const seeded = [
        ...(await credentialsFor(database, OPERATOR_ID)),
        ...(await credentialsFor(database, RESPONSE_STAFF_ID)),
      ].map((row) => ({ id: row.id, passwordHash: row.passwordHash }));
      expect(seeded.map((row) => row.passwordHash).sort()).toEqual([
        'test-argon2id$first:1',
        'test-argon2id$first:2',
      ]);

      const secondRun = await seedStaff(database.db, second.options);

      expect(secondRun).toEqual({
        inserted: 0,
        existing: 2,
        operatorCredentialProvisioned: false,
        responseStaffCredentialProvisioned: false,
      });
      // The reseed neither hashed the new secrets nor touched the stored credentials.
      expect(second.calls).toEqual([]);
      const afterReseed = [
        ...(await credentialsFor(database, OPERATOR_ID)),
        ...(await credentialsFor(database, RESPONSE_STAFF_ID)),
      ].map((row) => ({ id: row.id, passwordHash: row.passwordHash }));
      expect(afterReseed).toEqual(seeded);
      expect(await rowCount(database, staffCredential)).toBe(2);
    } finally {
      await database.dispose();
    }
  });

  it('reseeds existing credentials without any secret at all', async () => {
    const database = await createTestDatabase();
    try {
      await seedStaff(database.db, optionsFor('first').options);

      const withoutSecret = optionsFor('second', null, null);
      const result = await seedStaff(database.db, withoutSecret.options);

      expect(result).toEqual({
        inserted: 0,
        existing: 2,
        operatorCredentialProvisioned: false,
        responseStaffCredentialProvisioned: false,
      });
      expect(withoutSecret.calls).toEqual([]);
      expect(await rowCount(database, staffUser)).toBe(2);
      expect(await rowCount(database, staffCredential)).toBe(2);
    } finally {
      await database.dispose();
    }
  });

  it('keeps the seeded rows deterministic across calls', () => {
    expect(staffSeedRows()).toEqual(staffSeedRows());
    expect(new Set(staffSeedRows().map((row) => row.id)).size).toBe(2);
  });

  it('stores each deployment secret as an Argon2id hash at the NFR-021 floor', async () => {
    const database = await createTestDatabase();
    try {
      // The same composition `seeds/index.ts` performs: the platform adapter, not a stand-in.
      const { hasher } = createCredentialAdapters({
        totpSecretKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        operatorInitialPassword: null,
        responseStaffInitialPassword: null,
      });

      await seedStaff(database.db, {
        hasher,
        operatorInitialPassword: OPERATOR_PASSWORD,
        responseStaffInitialPassword: RESPONSE_PASSWORD,
      });

      const rows = await database.db
        .select({
          staffUserId: staffCredential.staffUserId,
          passwordHash: staffCredential.passwordHash,
        })
        .from(staffCredential)
        .orderBy(staffCredential.staffUserId);
      expect(rows.map((row) => row.staffUserId)).toEqual([OPERATOR_ID, RESPONSE_STAFF_ID]);

      const secretFor = new Map([
        [OPERATOR_ID, OPERATOR_PASSWORD],
        [RESPONSE_STAFF_ID, RESPONSE_PASSWORD],
      ]);

      for (const row of rows) {
        // NFR-021: Argon2id, cost 12 or above. The adapter's 19 MiB and one lane are its own fixture.
        expect(row.passwordHash.startsWith('$argon2id$v=19$m=19456,t=12,p=1$')).toBe(true);
        expect(row.passwordHash).not.toContain(OPERATOR_PASSWORD);
        expect(row.passwordHash).not.toContain(RESPONSE_PASSWORD);

        // C-092: the password step compares the typed password against this hash, so the seeded row
        // must authenticate its own secret — and only its own. That is what lets the response-staff
        // member sign in without the operator resetting a credential first.
        for (const [staffUserId, secret] of secretFor) {
          expect(await hasher.verify(row.passwordHash, secret)).toBe(
            staffUserId === row.staffUserId,
          );
        }
      }
    } finally {
      await database.dispose();
    }
  });
});
