/**
 * The first staff accounts the campaign needs, and the operator credential that makes the first
 * sign-in possible (`schema.md` StaffUser and StaffCredential, `operations.md` Staff sign-in, ADR-004,
 * `C-092`, `C-093`).
 *
 * Two accounts are seeded: the operator, who works the data-request queue and resets credentials, and
 * one response-staff member, who works the decision and ward-review queues. Both are `StaffUser` rows.
 * Only the operator gains a `StaffCredential`, because a clean deployment has nobody who can sign in
 * otherwise; the operator resets every other credential through the Staff credentials panel once they
 * are in (`C-093`).
 *
 * The operator's password arrives as a deployment secret (`STAFF_OPERATOR_INITIAL_PASSWORD`) and is
 * hashed here through the injected `NFR-021` hasher before it is stored. No plaintext, hash or secret
 * is committed, logged or echoed by this module. A clean database with no secret fails loudly rather
 * than leaving an account nobody can sign in to, and an existing credential is never overwritten, so a
 * reseed cannot undo a password the operator has since reset.
 *
 * The rows are deterministic - fixed identifiers, names, roles and creation instant - so a second run
 * inserts nothing and no re-run rewrites a role, reactivates an account an operator deactivated, or
 * replaces a credential.
 */
import { eq } from 'drizzle-orm';
import type { StaffUser } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { staffCredential } from '../schema/staff-credential.ts';
import { staffUser } from '../schema/staff-user.ts';

/** The seed instant, fixed so the rows are byte-identical on every run. */
const SEEDED_AT = '2026-11-01T00:00:00Z';

/** The operator's stable row identifiers. The credential carries the `scd_` prefix `C-001` assigns. */
export const OPERATOR_ID = 'stf_01J9Z0000000000000000OPER';
const OPERATOR_CREDENTIAL_ID = 'scd_01J9Z0000000000000000OPER';

/**
 * The operator's sign-in name.
 *
 * `C-092` fixes the form `^[a-z0-9][a-z0-9._-]{2,31}$` and requires it to be a staff identifier, never
 * a member identifier, a telephone number or an email address.
 */
export const OPERATOR_USERNAME = 'operator';

/** The two accounts, keyed by the stable identifiers the seed owns. */
export const staffSeedRows = (): readonly StaffUser[] => [
  {
    id: OPERATOR_ID,
    fullName: 'Campaign Operator',
    role: 'operator',
    external: false,
    authorisedWardIds: [],
    secondFactorEnrolled: false,
    active: true,
    createdAt: SEEDED_AT,
  },
  {
    id: 'stf_01J9Z0000000000000000RESP',
    fullName: 'Response Staff',
    role: 'response_staff',
    external: false,
    authorisedWardIds: [],
    secondFactorEnrolled: false,
    active: true,
    createdAt: SEEDED_AT,
  },
];

/**
 * The one effect the seed needs from credential material.
 *
 * Structurally the `hash` half of the domain's `PasswordHasherPort`; the seed never compares a
 * password, so it does not ask for the rest. `packages/platform` supplies the Argon2id implementation
 * and the seed entry composes it (`packages/db/AGENTS.md` Scope).
 */
export interface SeedPasswordHasher {
  /** Hash one password for storage (`NFR-021`: Argon2id at cost 12 or above). */
  hash(password: string): Promise<string>;
}

/** What the staff seed needs from its caller. */
export interface StaffSeedOptions {
  /** The `NFR-021` hasher. The seed performs no hashing of its own. */
  readonly hasher: SeedPasswordHasher;
  /**
   * The operator's one-time password from the deployment secret, or `null` when the deployment sets
   * none. It is read only when a credential is missing, so an ordinary reseed needs no secret.
   */
  readonly operatorInitialPassword: string | null;
}

/**
 * A seed refused because the deployment is not ready, not because a row is wrong.
 *
 * The message names the variable or the rule and never quotes a value: the deployment secret is a
 * credential and must not reach a log, a terminal or an error tracker.
 */
export class SeedConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedConfigurationError';
  }
}

/** What the staff seed did on this run. */
export interface StaffSeedResult {
  readonly inserted: number;
  readonly existing: number;
  /** True only on the run that wrote the operator credential; a reseed leaves it false. */
  readonly credentialProvisioned: boolean;
}

/** Hash the deployment password, refusing a secret the sign-in rules could never accept. */
async function hashOperatorPassword(options: StaffSeedOptions): Promise<string> {
  const password = options.operatorInitialPassword;
  if (password === null) {
    throw new SeedConfigurationError(
      'the first operator credential needs STAFF_OPERATOR_INITIAL_PASSWORD; set the deployment secret before seeding a clean database',
    );
  }
  // C-092 states the sign-in bounds: twelve to one hundred and twenty-eight characters. A secret
  // outside them would be hashed into a credential nobody could use, so the seed refuses it here.
  if (password.length < 12 || password.length > 128) {
    throw new SeedConfigurationError(
      'STAFF_OPERATOR_INITIAL_PASSWORD must be 12 to 128 characters, the bounds C-092 sets for a staff password',
    );
  }
  return options.hasher.hash(password);
}

/** Reads the operator credential's identifier, or `undefined` when there is none. */
async function findOperatorCredential(executor: Executor): Promise<string | undefined> {
  const rows = await executorOf(executor)
    .select({ id: staffCredential.id })
    .from(staffCredential)
    .where(eq(staffCredential.staffUserId, OPERATOR_ID))
    .limit(1);
  return rows[0]?.id;
}

/**
 * Writes the seeded staff accounts and, once, the operator credential.
 *
 * A row the database already holds is skipped by its primary key, so a second run changes nothing and
 * an account that later gained a role change or a deactivation is left exactly as the operator left
 * it. The credential is written only when the operator has none, which is what keeps a reseed from
 * overwriting a password the operator reset (`operations.md` Staff sign-in).
 *
 * @param executor - The shared client, or the transaction the runner already opened.
 * @param options - The password hasher and the deployment secret, if any.
 * @throws SeedConfigurationError when the credential is missing and no usable secret is configured.
 */
export async function seedStaff(
  executor: Executor,
  options: StaffSeedOptions,
): Promise<StaffSeedResult> {
  const db = executorOf(executor);
  const rows = staffSeedRows();

  // Decide and hash before any write: a missing or unusable secret must leave the database untouched
  // even when the caller handed in a transaction it intends to keep using.
  const existingCredential = await findOperatorCredential(executor);
  const passwordHash =
    existingCredential === undefined ? await hashOperatorPassword(options) : null;

  const inserted = await db
    .insert(staffUser)
    .values(
      rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        role: row.role,
        external: row.external,
        authorisedWardIds: [...row.authorisedWardIds],
        secondFactorEnrolled: row.secondFactorEnrolled,
        active: row.active,
        createdAt: row.createdAt,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: staffUser.id });

  let credentialProvisioned = false;
  if (passwordHash !== null) {
    const provisioned = await db
      .insert(staffCredential)
      .values({
        id: OPERATOR_CREDENTIAL_ID,
        staffUserId: OPERATOR_ID,
        username: OPERATOR_USERNAME,
        passwordHash,
        passwordChangedAt: SEEDED_AT,
        // The second factor is enrolled by the operator through C-092; the seed never invents one.
        totpSecretEncrypted: null,
        secondFactorEnrolledAt: null,
        recoveryCodes: [],
        failedAttemptCount: 0,
        lockedUntil: null,
        lastSignInAt: null,
        createdAt: SEEDED_AT,
      })
      .onConflictDoNothing()
      .returning({ id: staffCredential.id });
    credentialProvisioned = provisioned.length > 0;

    // Two unique keys can swallow the insert: the credential id and the username. If either is held
    // by something other than this operator, the account would be left unusable, so say so rather
    // than reporting success.
    if (!credentialProvisioned && (await findOperatorCredential(executor)) === undefined) {
      throw new SeedConfigurationError(
        `the operator credential could not be written because the staff username "${OPERATOR_USERNAME}" is already held by another credential`,
      );
    }
  }

  return {
    inserted: inserted.length,
    existing: rows.length - inserted.length,
    credentialProvisioned,
  };
}
