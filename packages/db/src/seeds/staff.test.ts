/**
 * The first staff accounts and the operator credential (`operations.md` Staff sign-in, ADR-004,
 * `C-092`, `NFR-021`).
 *
 * The suite proves the three properties the seed must hold: on a clean deployment the operator gets a
 * credential whose stored value is the hasher's output and never the plaintext; a deployment with no
 * usable secret fails before it writes anything; and a later reseed never replaces a credential the
 * operator has since reset.
 *
 * The hasher is a tagged double, so the stored value is inspectable without a real Argon2id call. The
 * adapter's own suite proves the algorithm; this one proves the seed stores only what it returns.
 */
import { count, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createCredentialAdapters } from '@odp/platform';
import { staffCredential } from '../schema/staff-credential.ts';
import { staffUser } from '../schema/staff-user.ts';
import { createTestDatabase } from '../testing/index.ts';
import {
  OPERATOR_ID,
  OPERATOR_USERNAME,
  SeedConfigurationError,
  seedStaff,
  staffSeedRows,
  type SeedPasswordHasher,
  type StaffSeedOptions,
} from './staff.ts';

/** `C-092`'s floor, so the tag below is a usable secret rather than a rejected one. */
const PASSWORD = 'seed-suite-operator-password';

interface TaggedHasher {
  readonly calls: string[];
  readonly hasher: SeedPasswordHasher;
}

/** A hasher that records what it was asked to hash and returns a fixed tag instead of the password. */
function taggedHasher(tag: string): TaggedHasher {
  const calls: string[] = [];
  return {
    calls,
    hasher: {
      async hash(password: string): Promise<string> {
        calls.push(password);
        return `test-argon2id$${tag}`;
      },
    },
  };
}

function optionsFor(
  tag: string,
  password: string | null = PASSWORD,
): {
  readonly calls: string[];
  readonly options: StaffSeedOptions;
} {
  const { calls, hasher } = taggedHasher(tag);
  return { calls, options: { hasher, operatorInitialPassword: password } };
}

/** The number of rows in one table, as a number: `count()` comes back as a string. */
async function rowCount(
  database: Awaited<ReturnType<typeof createTestDatabase>>,
  table: typeof staffUser | typeof staffCredential,
): Promise<number> {
  const rows = await database.db.select({ value: count() }).from(table);
  return Number(rows[0]?.value ?? 0);
}

describe('first staff seed', () => {
  it('seeds both accounts and the operator credential from the deployment secret', async () => {
    const database = await createTestDatabase();
    try {
      const { calls, options } = optionsFor('first');

      const result = await seedStaff(database.db, options);

      expect(result).toEqual({ inserted: 2, existing: 0, credentialProvisioned: true });
      expect(calls).toEqual([PASSWORD]);

      const staff = await database.db.select().from(staffUser).orderBy(staffUser.id);
      expect(staff).toHaveLength(2);
      expect(staff.map((row) => row.role).sort()).toEqual(['operator', 'response_staff']);
      expect(staff.every((row) => row.secondFactorEnrolled === false)).toBe(true);

      const credentials = await database.db
        .select()
        .from(staffCredential)
        .where(eq(staffCredential.staffUserId, OPERATOR_ID));
      expect(credentials).toHaveLength(1);
      const credential = credentials[0];
      expect(credential).toBeDefined();
      if (credential === undefined) return;

      expect(credential.username).toBe(OPERATOR_USERNAME);
      expect(credential.passwordHash).toBe('test-argon2id$first');
      expect(credential.passwordHash).not.toBe(PASSWORD);
      expect(credential.passwordChangedAt).toBe('2026-11-01T00:00:00Z');
      // The second factor is the operator's to enrol through C-092; the seed never invents one.
      expect(credential.totpSecretEncrypted).toBeNull();
      expect(credential.secondFactorEnrolledAt).toBeNull();
      expect(credential.recoveryCodes).toEqual([]);
      expect(credential.failedAttemptCount).toBe(0);
      expect(credential.lockedUntil).toBeNull();
      expect(credential.lastSignInAt).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('refuses a clean database with no secret and writes nothing', async () => {
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

  it('refuses a secret the sign-in rules could never accept and names the rule, not the value', async () => {
    const database = await createTestDatabase();
    try {
      const { options } = optionsFor('first', 'too-short');

      const error: unknown = await seedStaff(database.db, options).catch(
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(SeedConfigurationError);
      expect((error as Error).message).toMatch(/12 to 128 characters/);
      expect((error as Error).message).not.toContain('too-short');

      expect(await rowCount(database, staffUser)).toBe(0);
    } finally {
      await database.dispose();
    }
  });

  it('writes the credential once and never replaces it on a reseed', async () => {
    const database = await createTestDatabase();
    try {
      const first = optionsFor('first');
      const second = optionsFor('second', 'a-different-operator-password');

      await seedStaff(database.db, first.options);
      const stored = await database.db
        .select({ id: staffCredential.id, passwordHash: staffCredential.passwordHash })
        .from(staffCredential)
        .where(eq(staffCredential.staffUserId, OPERATOR_ID));
      const seeded = stored[0];
      expect(seeded?.passwordHash).toBe('test-argon2id$first');

      const secondRun = await seedStaff(database.db, second.options);

      expect(secondRun).toEqual({ inserted: 0, existing: 2, credentialProvisioned: false });
      // The reseed neither hashed the new secret nor touched the stored credential.
      expect(second.calls).toEqual([]);
      expect(
        await database.db
          .select({ id: staffCredential.id, passwordHash: staffCredential.passwordHash })
          .from(staffCredential)
          .where(eq(staffCredential.staffUserId, OPERATOR_ID)),
      ).toEqual([seeded]);
      expect(await rowCount(database, staffCredential)).toBe(1);
    } finally {
      await database.dispose();
    }
  });

  it('reseeds an existing credential without any secret at all', async () => {
    const database = await createTestDatabase();
    try {
      await seedStaff(database.db, optionsFor('first').options);

      const withoutSecret = optionsFor('second', null);
      const result = await seedStaff(database.db, withoutSecret.options);

      expect(result).toEqual({ inserted: 0, existing: 2, credentialProvisioned: false });
      expect(withoutSecret.calls).toEqual([]);
      expect(await rowCount(database, staffUser)).toBe(2);
    } finally {
      await database.dispose();
    }
  });

  it('keeps the seeded rows deterministic across calls', () => {
    expect(staffSeedRows()).toEqual(staffSeedRows());
    expect(new Set(staffSeedRows().map((row) => row.id)).size).toBe(2);
  });

  it('stores the deployment secret as an Argon2id hash at the NFR-021 floor', async () => {
    const database = await createTestDatabase();
    try {
      // The same composition `seeds/index.ts` performs: the platform adapter, not a stand-in.
      const { hasher } = createCredentialAdapters({
        totpSecretKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
        operatorInitialPassword: null,
      });

      await seedStaff(database.db, { hasher, operatorInitialPassword: PASSWORD });

      const rows = await database.db
        .select({ passwordHash: staffCredential.passwordHash })
        .from(staffCredential)
        .where(eq(staffCredential.staffUserId, OPERATOR_ID));
      const hash = rows[0]?.passwordHash ?? '';
      // NFR-021: Argon2id, cost 12 or above. The adapter's 19 MiB and one lane are its own fixture.
      expect(hash.startsWith('$argon2id$v=19$m=19456,t=12,p=1$')).toBe(true);
      expect(hash).not.toContain(PASSWORD);
    } finally {
      await database.dispose();
    }
  });
});
