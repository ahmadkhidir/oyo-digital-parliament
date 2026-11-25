/**
 * The first staff accounts the campaign needs, and the credentials that make the first sign-ins
 * possible (`schema.md` StaffUser and StaffCredential, `operations.md` Staff sign-in, ADR-004,
 * `C-092`, `C-093`).
 *
 * Two accounts are seeded: the operator, who works the data-request queue and resets credentials, and
 * one response-staff member, who works the decision and ward-review queues. Both are `StaffUser` rows,
 * and on a clean deployment both gain a `StaffCredential`, because a deployment with no credential has
 * nobody who can sign in at all. The operator's password is the documented bootstrap. The
 * response-staff password is provisioned here as well while the only way a non-operator credential can
 * exist is the seed; once a staff-account creation surface is settled the operator creates further
 * accounts and resets every other credential through the Staff credentials panel (`C-093`).
 *
 * Each password arrives as its own deployment secret - `STAFF_OPERATOR_INITIAL_PASSWORD` and
 * `STAFF_RESPONSE_STAFF_INITIAL_PASSWORD` - and is hashed here through the injected `NFR-021` hasher
 * before it is stored. No plaintext, hash or secret is committed, logged or echoed by this module. A
 * clean database whose secret is missing or outside the sign-in bounds fails loudly before any row is
 * written, rather than leaving an account nobody can sign in to, and an existing credential is never
 * overwritten, so a reseed cannot undo a password that has since been reset.
 *
 * The seed never invents a second factor. Both credentials are written unenrolled; the staff member
 * enrols through `C-092` on the first sign-in, and only a satisfied second factor admits the admin
 * screens - for the response-staff account, the ward review queue `C-055` serves.
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

/** The response-staff member's stable row identifiers; its credential is a record like any other. */
export const RESPONSE_STAFF_ID = 'stf_01J9Z0000000000000000RESP';
const RESPONSE_STAFF_CREDENTIAL_ID = 'scd_01J9Z0000000000000000RESP';

/**
 * The staff sign-in names.
 *
 * `C-092` fixes the form `^[a-z0-9][a-z0-9._-]{2,31}$` and requires each to be a staff identifier,
 * never a member identifier, a telephone number or an email address.
 */
export const OPERATOR_USERNAME = 'operator';
export const RESPONSE_STAFF_USERNAME = 'response';

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
    id: RESPONSE_STAFF_ID,
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
   * none. It is read only when the credential is missing, so an ordinary reseed needs no secret.
   */
  readonly operatorInitialPassword: string | null;
  /**
   * The response-staff member's one-time password from its own deployment secret, or `null` when the
   * deployment sets none. Read only when that credential is missing, exactly as the operator's is.
   */
  readonly responseStaffInitialPassword: string | null;
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
  readonly operatorCredentialProvisioned: boolean;
  /** True only on the run that wrote the response-staff credential; a reseed leaves it false. */
  readonly responseStaffCredentialProvisioned: boolean;
}

/** One credential the seed may have to write, and the deployment secret that makes it usable. */
interface CredentialPlan {
  /** The `scd_` record identifier. */
  readonly id: string;
  /** The `StaffUser` the credential belongs to. */
  readonly staffUserId: string;
  /** The unique sign-in name. */
  readonly username: string;
  /** The deployment variable the password arrives in, named in every refusal. */
  readonly variable: string;
  /** What the credential belongs to, for a refusal message an operator can act on. */
  readonly subject: string;
  /** The deployment secret, or `null` when the deployment sets none. */
  readonly password: string | null;
}

/** The two credentials, one per seeded account, defined once for hashing and for writing. */
function credentialPlans(options: StaffSeedOptions): readonly CredentialPlan[] {
  return [
    {
      id: OPERATOR_CREDENTIAL_ID,
      staffUserId: OPERATOR_ID,
      username: OPERATOR_USERNAME,
      variable: 'STAFF_OPERATOR_INITIAL_PASSWORD',
      subject: 'the first operator credential',
      password: options.operatorInitialPassword,
    },
    {
      id: RESPONSE_STAFF_CREDENTIAL_ID,
      staffUserId: RESPONSE_STAFF_ID,
      username: RESPONSE_STAFF_USERNAME,
      variable: 'STAFF_RESPONSE_STAFF_INITIAL_PASSWORD',
      subject: 'the seeded response-staff credential',
      password: options.responseStaffInitialPassword,
    },
  ];
}

/** Hash one deployment password, refusing a secret the sign-in rules could never accept. */
async function hashDeploymentPassword(
  options: StaffSeedOptions,
  plan: CredentialPlan,
): Promise<string> {
  const password = plan.password;
  if (password === null) {
    throw new SeedConfigurationError(
      `${plan.subject} needs ${plan.variable}; set the deployment secret before seeding a clean database`,
    );
  }
  // C-092 states the sign-in bounds: twelve to one hundred and twenty-eight characters. A secret
  // outside them would be hashed into a credential nobody could use, so the seed refuses it here.
  if (password.length < 12 || password.length > 128) {
    throw new SeedConfigurationError(
      `${plan.variable} must be 12 to 128 characters, the bounds C-092 sets for a staff password`,
    );
  }
  return options.hasher.hash(password);
}

/** Reads one staff user's credential identifier, or `undefined` when there is none. */
async function findCredential(
  executor: Executor,
  staffUserId: string,
): Promise<string | undefined> {
  const rows = await executorOf(executor)
    .select({ id: staffCredential.id })
    .from(staffCredential)
    .where(eq(staffCredential.staffUserId, staffUserId))
    .limit(1);
  return rows[0]?.id;
}

/**
 * Writes one credential over a stored password hash, or reports that one already exists.
 *
 * @returns True when this call wrote the row.
 * @throws SeedConfigurationError when the insert was swallowed by a username held elsewhere, which
 *   would leave the account unable to sign in.
 */
async function provisionCredential(
  executor: Executor,
  plan: CredentialPlan,
  passwordHash: string,
): Promise<boolean> {
  const inserted = await executorOf(executor)
    .insert(staffCredential)
    .values({
      id: plan.id,
      staffUserId: plan.staffUserId,
      username: plan.username,
      passwordHash,
      passwordChangedAt: SEEDED_AT,
      // The second factor is enrolled by the staff member through C-092; the seed never invents one.
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

  if (inserted.length > 0) return true;

  // Two unique keys can swallow the insert: the credential id and the username. If neither holds a
  // credential for this staff user, the username is held by something else and the account would be
  // left unusable, so say so rather than reporting success.
  if ((await findCredential(executor, plan.staffUserId)) === undefined) {
    throw new SeedConfigurationError(
      `${plan.subject} could not be written because the staff username "${plan.username}" is already held by another credential`,
    );
  }
  return false;
}

/**
 * Writes the seeded staff accounts and, once each, their credentials.
 *
 * A row the database already holds is skipped by its primary key, so a second run changes nothing and
 * an account that later gained a role change or a deactivation is left exactly as the operator left
 * it. A credential is written only when its staff user has none, which is what keeps a reseed from
 * overwriting a password that has since been reset (`operations.md` Staff sign-in).
 *
 * @param executor - The shared client, or the transaction the runner already opened.
 * @param options - The password hasher and the two deployment secrets, if any.
 * @throws SeedConfigurationError when a credential is missing and its deployment secret is absent,
 *   outside the `C-092` bounds, or already claimed by another account. Nothing is written in that case.
 */
export async function seedStaff(
  executor: Executor,
  options: StaffSeedOptions,
): Promise<StaffSeedResult> {
  const db = executorOf(executor);
  const rows = staffSeedRows();
  const plans = credentialPlans(options);

  // Decide and hash before any write: a missing or unusable secret must leave the database untouched
  // even when the caller handed in a transaction it intends to keep using.
  const pending: { readonly plan: CredentialPlan; readonly passwordHash: string }[] = [];
  for (const plan of plans) {
    if ((await findCredential(executor, plan.staffUserId)) !== undefined) continue;
    pending.push({ plan, passwordHash: await hashDeploymentPassword(options, plan) });
  }

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

  let operatorCredentialProvisioned = false;
  let responseStaffCredentialProvisioned = false;
  for (const { plan, passwordHash } of pending) {
    const provisioned = await provisionCredential(executor, plan, passwordHash);
    if (plan.staffUserId === OPERATOR_ID) operatorCredentialProvisioned = provisioned;
    if (plan.staffUserId === RESPONSE_STAFF_ID) responseStaffCredentialProvisioned = provisioned;
  }

  return {
    inserted: inserted.length,
    existing: rows.length - inserted.length,
    operatorCredentialProvisioned,
    responseStaffCredentialProvisioned,
  };
}
