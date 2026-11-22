/**
 * Staff credentials (`schema.md` StaffCredential, `C-092`, `C-093`, ADR-004).
 *
 * The persistence half of staff sign-in: the username lookup, the password comparison, the attempt
 * counter and its lock, the TOTP enrolment, the code checks and the recovery codes. Password hashing,
 * secret sealing and code arithmetic are **not** performed here; they arrive as three injected
 * credential-material ports (`NFR-021`, `NFR-024`), because this package owns PostgreSQL and not a
 * cipher.
 *
 * Three rules shape the module:
 *
 * - **No secret leaves the repository.** A row is never returned to a caller: each read maps to the
 *   domain's `StaffCredentialState`, which carries no hash, no secret and no recovery code, only whether
 *   each code was spent (`packages/db/AGENTS.md` Discipline).
 * - **An unknown credential costs what a wrong password costs.** `C-092` requires an unknown username
 *   and a wrong password to be indistinguishable, so every miss runs the hasher's no-credential
 *   comparison instead of returning early.
 * - **One staff user holds one credential.** The unique index on `staff_user_id` enforces it, and the
 *   candidate key `scd_` prefix is the identifier `C-001` records.
 *
 * `C-093` clears the enrolled factor by setting `totp_secret_encrypted` to null, clearing
 * `second_factor_enrolled_at`, `recovery_codes`, `failed_attempt_count` and `locked_until`, and
 * replacing the password hash. That end state is expressed by {@link StaffCredentialResetPort} on the
 * same repository: the panel's list and the one reset write. The identity use case decides who may
 * call it, why, and what is audited; this module performs the SQL.
 */
import { eq, sql } from 'drizzle-orm';
import type {
  StaffCredentialPort,
  StaffCredentialResetPort,
  StaffCredentialState,
  TotpEnrolment,
} from '@odp/domain';
import type {
  PasswordHasherPort,
  SecondFactorPort,
  TotpSecretCipherPort,
} from '../../../domain/src/ports/password.ts';
import { executorOf, type Executor } from '../client.ts';
import { staffCredential, type RecoveryCodeHash } from '../schema/staff-credential.ts';
import { staffUser } from '../schema/staff-user.ts';

/**
 * The credential-material seams this repository needs.
 *
 * Structurally identical to the ports `@odp/domain` declares in `src/ports/password.ts`; the shapes
 * are repeated here because this package implements a port by structure rather than by importing an
 * adapter (`packages/db/AGENTS.md` Scope). `packages/platform` supplies the implementations.
 */
export interface StaffCredentialSeams {
  /** Argon2id hashing at cost 12 or above (`NFR-021`). */
  readonly hasher: PasswordHasherPort;
  /** AES-256-GCM sealing for the stored TOTP secret (`NFR-024`). */
  readonly cipher: TotpSecretCipherPort;
  /** TOTP code arithmetic and recovery-code minting (`C-092`). */
  readonly secondFactor: SecondFactorPort;
}

/** One repository implements the credential port and the operator's reset write (`C-092`, `C-093`). */
export type StaffCredentialRepository = StaffCredentialPort & StaffCredentialResetPort;

/**
 * The projection the domain reads: identifiers and state, never a hash, a secret or a code.
 *
 * `schema.md` makes `passwordChangedAt` optional; a credential whose instant predates the column
 * reads its creation instant, which is when its first password was set.
 */
function toCredentialState(row: typeof staffCredential.$inferSelect): StaffCredentialState {
  const secondFactorEnrolledAt = row.secondFactorEnrolledAt ?? undefined;
  const lockedUntil = row.lockedUntil ?? undefined;
  const lastSignInAt = row.lastSignInAt ?? undefined;
  return {
    id: row.id,
    staffUserId: row.staffUserId,
    username: row.username,
    passwordChangedAt: row.passwordChangedAt ?? row.createdAt,
    ...(secondFactorEnrolledAt === undefined ? {} : { secondFactorEnrolledAt }),
    recoveryCodes: row.recoveryCodes.map((code) =>
      code.usedAt === undefined ? {} : { usedAt: code.usedAt },
    ),
    failedAttemptCount: row.failedAttemptCount,
    ...(lockedUntil === undefined ? {} : { lockedUntil }),
    ...(lastSignInAt === undefined ? {} : { lastSignInAt }),
  };
}

/**
 * Builds the credential repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the sign-in flow already holds.
 * @param seams - The hasher, the secret cipher and the second-factor codec.
 */
export function createStaffCredentialRepository(
  executor: Executor,
  seams: StaffCredentialSeams,
): StaffCredentialRepository {
  const db = executorOf(executor);

  /** Reads one stored secret for a check; only this module ever sees it. */
  async function readSecret(
    credentialId: string,
  ): Promise<{ readonly secret: string | null } | null> {
    const rows = await db
      .select({ totpSecretEncrypted: staffCredential.totpSecretEncrypted })
      .from(staffCredential)
      .where(eq(staffCredential.id, credentialId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) return null;
    return row.totpSecretEncrypted === null
      ? { secret: null }
      : { secret: row.totpSecretEncrypted };
  }

  return {
    async findByUsername(username) {
      // Read path: `staff_credential_username_key` (C-092, the password step).
      const rows = await db
        .select()
        .from(staffCredential)
        .where(eq(staffCredential.username, username))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toCredentialState(row);
    },

    async findByStaffUserId(staffUserId) {
      // Read path: `staff_credential_staff_user_key` (C-092, enrolment and verification).
      const rows = await db
        .select()
        .from(staffCredential)
        .where(eq(staffCredential.staffUserId, staffUserId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toCredentialState(row);
    },

    async verifyPassword(credentialId, password) {
      if (credentialId === null) {
        // The username matched nothing: do the same work, answer the same refusal (C-092).
        await seams.hasher.verifyWithoutCredential(password);
        return false;
      }

      const rows = await db
        .select({ passwordHash: staffCredential.passwordHash })
        .from(staffCredential)
        .where(eq(staffCredential.id, credentialId))
        .limit(1);
      const stored = rows[0]?.passwordHash;
      if (stored === undefined) {
        await seams.hasher.verifyWithoutCredential(password);
        return false;
      }
      return seams.hasher.verify(stored, password);
    },

    async recordFailure(credentialId, input) {
      // One statement, so two simultaneous failures cannot both read the same count: a lapsed lock
      // restarts the count at one, every other failure adds one, and the attempt that reaches the limit
      // writes the lock expiry. `lockWindowSeconds` is not applied as a rolling window because
      // `schema.md` gives the credential no last-failure instant; the lock itself is the reset boundary
      // it describes, and the count clears when the lock lapses.
      void input.lockWindowSeconds;

      const lapsed = sql`(${staffCredential.lockedUntil} is not null and ${staffCredential.lockedUntil} <= ${input.at}::timestamptz)`;
      const nextCount = sql`case when ${lapsed} then 1 else ${staffCredential.failedAttemptCount} + 1 end`;

      const rows = await db
        .update(staffCredential)
        .set({
          failedAttemptCount: nextCount,
          lockedUntil: sql`case
            when ${lapsed} then null
            when ${nextCount} >= ${input.lockAttemptLimit} then ${input.at}::timestamptz + make_interval(secs => ${input.lockSeconds}::int)
            else ${staffCredential.lockedUntil}
          end`,
        })
        .where(eq(staffCredential.id, credentialId))
        .returning({
          failedAttemptCount: staffCredential.failedAttemptCount,
          lockedUntil: staffCredential.lockedUntil,
        });

      const row = rows[0];
      if (row === undefined) throw new Error('the credential to record a failure against is gone');
      return row.lockedUntil === null
        ? { failedAttemptCount: row.failedAttemptCount }
        : { failedAttemptCount: row.failedAttemptCount, lockedUntil: row.lockedUntil };
    },

    async clearFailures(credentialId, at) {
      // The instant is part of the caller's clock in the same unit of work; the table records no
      // separate "cleared at" column (`schema.md` StaffCredential).
      void at;
      await db
        .update(staffCredential)
        .set({ failedAttemptCount: 0, lockedUntil: null })
        .where(eq(staffCredential.id, credentialId));
    },

    async recordSignIn(credentialId, at) {
      await db
        .update(staffCredential)
        .set({ lastSignInAt: at })
        .where(eq(staffCredential.id, credentialId));
    },

    async beginTotpEnrolment(credentialId, input) {
      const secret = seams.secondFactor.generateSecret();
      // The plaintext secret leaves this function once, in the answer, and is stored only sealed.
      const rows = await db
        .update(staffCredential)
        .set({ totpSecretEncrypted: seams.cipher.seal(secret) })
        .where(eq(staffCredential.id, credentialId))
        .returning({ id: staffCredential.id });
      if (rows.length === 0) throw new Error('the credential to enrol is gone');

      const enrolment: TotpEnrolment = {
        otpauthUri: seams.secondFactor.otpauthUri({
          account: input.username,
          issuer: input.issuer,
          secret,
          algorithm: input.algorithm,
          digits: input.digits,
          periodSeconds: input.periodSeconds,
        }),
        secret,
        algorithm: input.algorithm,
        digits: input.digits,
        periodSeconds: input.periodSeconds,
      };
      return enrolment;
    },

    async completeTotpEnrolment(credentialId, input) {
      const stored = await readSecret(credentialId);
      // No pending secret is not a matched code: nothing was proved, so no recovery code is issued and
      // no enrollment is written. The domain only reaches this after `begin`, so a null here is a
      // credential reset in between.
      if (stored === null || stored.secret === null) return { verified: false };

      const secret = seams.cipher.open(stored.secret);
      const verified = seams.secondFactor.verifyCode({
        secret,
        code: input.code,
        at: input.at,
        digits: input.digits,
        periodSeconds: input.periodSeconds,
        windowSteps: input.windowSteps,
      });
      if (!verified) return { verified: false };

      const recoveryCodes = seams.secondFactor.generateRecoveryCodes(input.recoveryCodeCount);
      const hashes: RecoveryCodeHash[] = recoveryCodes.map((code) => ({
        codeHash: seams.secondFactor.hashRecoveryCode(code),
      }));

      await db
        .update(staffCredential)
        .set({ recoveryCodes: hashes, secondFactorEnrolledAt: input.at })
        .where(eq(staffCredential.id, credentialId));

      return { verified: true, enrolledAt: input.at, recoveryCodes };
    },

    async verifyTotp(credentialId, input) {
      const stored = await readSecret(credentialId);
      if (stored === null || stored.secret === null) return false;
      return seams.secondFactor.verifyCode({
        secret: seams.cipher.open(stored.secret),
        code: input.code,
        at: input.at,
        digits: input.digits,
        periodSeconds: input.periodSeconds,
        windowSteps: input.windowSteps,
      });
    },

    async verifyRecoveryCode(credentialId, code) {
      const rows = await db
        .select({ recoveryCodes: staffCredential.recoveryCodes })
        .from(staffCredential)
        .where(eq(staffCredential.id, credentialId))
        .limit(1);
      const stored = rows[0]?.recoveryCodes;
      if (stored === undefined) return null;

      // Comparing digests, not codes: the stored value is a one-way hash (`schema.md` StaffCredential).
      const digest = seams.secondFactor.hashRecoveryCode(code);
      const index = stored.findIndex((entry) => entry.codeHash === digest);
      if (index === -1) return null;

      const entry = stored[index];
      if (entry === undefined) return null;
      return entry.usedAt === undefined ? { index, spent: false } : { index, spent: true };
    },

    async spendRecoveryCode(credentialId, index, at) {
      if (!Number.isInteger(index) || index < 0) return false;

      // One conditional update marks the entry spent only if it is still unused, so two sign-ins racing
      // on one code cannot both be admitted (C-092). The array bounds are part of the guard: a stale
      // index must not append a new entry.
      const rows = await db
        .update(staffCredential)
        .set({
          recoveryCodes: sql`jsonb_set(
            ${staffCredential.recoveryCodes},
            array[${index}::text, 'usedAt'],
            to_jsonb(${at}::text)
          )`,
        })
        .where(
          sql`${staffCredential.id} = ${credentialId}
            and jsonb_typeof(${staffCredential.recoveryCodes} -> ${index}::int) = 'object'
            and (${staffCredential.recoveryCodes} -> ${index}::int ->> 'usedAt') is null`,
        )
        .returning({ id: staffCredential.id });

      return rows.length > 0;
    },

    async listResetTargets() {
      // Read path: the operator's credentials panel lists every staff account that holds a credential
      // (`C-093`, screen 26). A left join is deliberately not used: an account without a credential is
      // not a reset target, because `C-093` refuses a reset whose credential does not exist.
      const rows = await db
        .select({
          staffUserId: staffUser.id,
          fullName: staffUser.fullName,
          role: staffUser.role,
          active: staffUser.active,
          secondFactorEnrolled: staffUser.secondFactorEnrolled,
        })
        .from(staffCredential)
        .innerJoin(staffUser, eq(staffCredential.staffUserId, staffUser.id))
        .orderBy(staffUser.fullName);

      return rows;
    },

    async resetCredential(input) {
      // `C-093`: one write replaces the first factor and clears the second factor, its recovery codes,
      // the failure count and the lock. The password is hashed here rather than stored, and the
      // returned projection carries state only — never the hash that was just written.
      const passwordHash = await seams.hasher.hash(input.newPassword);
      const rows = await db
        .update(staffCredential)
        .set({
          passwordHash,
          passwordChangedAt: input.at,
          totpSecretEncrypted: null,
          secondFactorEnrolledAt: null,
          recoveryCodes: [],
          failedAttemptCount: 0,
          lockedUntil: null,
        })
        .where(eq(staffCredential.id, input.credentialId))
        .returning();

      const row = rows[0];
      if (row === undefined) throw new Error('the credential to reset is gone');
      return toCredentialState(row);
    },
  };
}
