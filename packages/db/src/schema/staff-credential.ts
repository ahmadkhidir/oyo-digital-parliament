/**
 * StaffCredential (`schema.md` StaffCredential, `C-092`, `C-093`, ADR-004).
 *
 * The credential a staff user signs in with, kept apart from the person so it can be reset without
 * touching the staff record. It holds **no member personal data**: the username is a staff identifier,
 * never a telephone number, a member identifier or an email address.
 *
 * Field classification (`C-001`, `NFR-021`, `NFR-024`):
 *
 * - `password_hash` — a credential secret. Argon2id at cost 12 or above (`NFR-021`), never plaintext,
 *   never reversible, never selected by a read that leaves this package. `varchar(255)` holds the
 *   encoded PHC string comfortably.
 * - `totp_secret_encrypted` — a credential secret. AES-256-GCM under `STAFF_TOTP_SECRET_KEY`; the
 *   plaintext exists only in the answer that shows it once at enrolment (`C-092`).
 * - `recovery_codes` — credential secrets, held only as digests. `jsonb` because `schema.md` defines
 *   the value as an array of `{ codeHash, usedAt }` records rather than a second table; a code is
 *   spent by writing `usedAt` on its own entry, which a conditional update does atomically.
 * - `username` — a staff identifier. Unique, lower-case, three to thirty-two characters
 *   (`^[a-z0-9][a-z0-9._-]{2,31}$`); it identifies the account and nothing about a person.
 *
 * **Nullability against `schema.md`.** `schema.md` lists `totpSecretEncrypted` among the required
 * properties, but `C-093` is explicit that an operator reset "clears `totpSecretEncrypted`": a reset
 * credential has no second factor until the staff member enrols again, and writing an empty string
 * would store a value no cipher could read. The column is therefore nullable, `C-093`'s write wins
 * over the required array, and the disagreement is reported as a specification gap rather than hidden
 * behind a placeholder secret. `recoveryCodes` stays required and is reset to an empty array, which is
 * the same state without a null.
 *
 * `passwordChangedAt` is optional in `schema.md` and nullable here; every write path that sets a
 * password sets it, and the repository reads a credential whose instant predates the row's creation as
 * `createdAt`.
 */
import { relations, sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { staffUser } from './staff-user.ts';

/**
 * One issued recovery code as stored: a digest and, once spent, the instant.
 *
 * No plaintext code is ever written. `usedAt` is absent while the code is unused, so a single-entry
 * conditional update is all a redemption needs (`C-092`).
 */
export interface RecoveryCodeHash {
  readonly codeHash: string;
  readonly usedAt?: string;
}

export const staffCredential = pgTable(
  'staff_credential',
  {
    id: text('id').primaryKey(),
    /** References the StaffUser; one staff user holds exactly one credential (`schema.md`). */
    staffUserId: text('staff_user_id')
      .notNull()
      .references(() => staffUser.id),
    /** The sign-in name. Unique across staff accounts; never a member value (`C-092`). */
    username: varchar('username', { length: 32 }).notNull(),
    /** A credential secret: an Argon2id hash at cost 12 or above, never the password (`NFR-021`). */
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    /** When the password was set or last reset. Nullable per `schema.md`; every write sets it. */
    passwordChangedAt: utcTimestamp('password_changed_at'),
    /** A credential secret: the TOTP shared secret, AES-256-GCM sealed (`NFR-024`). */
    totpSecretEncrypted: text('totp_secret_encrypted'),
    /** When enrolment was completed. Absent while enrolment is incomplete (`C-092`). */
    secondFactorEnrolledAt: utcTimestamp('second_factor_enrolled_at'),
    /** The issued recovery codes, held only as digests. Reset to an empty array by `C-093`. */
    recoveryCodes: jsonb('recovery_codes').$type<RecoveryCodeHash[]>().notNull(),
    /** Failures in the current window, cleared on success and when a lock lapses (`C-092`). */
    failedAttemptCount: integer('failed_attempt_count').notNull(),
    /** When the account lock lapses. Null means not locked (`C-092`). */
    lockedUntil: utcTimestamp('locked_until'),
    /** The last successful sign-in (`C-092`). */
    lastSignInAt: utcTimestamp('last_sign_in_at'),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('staff_credential_id_format', isIdentifier(t.id)),
    check('staff_credential_username_format', sql`${t.username} ~ '^[a-z0-9][a-z0-9._-]{2,31}$'`),
    check('staff_credential_failed_attempts', sql`${t.failedAttemptCount} >= 0`),
    // Read path: the password step looks a credential up by the username the staff member typed
    // (`C-092` beginStaffSignIn). Unique, so two accounts can never answer one username.
    uniqueIndex('staff_credential_username_key').on(t.username),
    // Read path: enrolment and verification look the credential up by the staff user the session
    // already identified (`C-092`), and the one-to-one rule `schema.md` states is enforced here.
    uniqueIndex('staff_credential_staff_user_key').on(t.staffUserId),
  ],
);

export const staffCredentialRelations = relations(staffCredential, ({ one }) => ({
  staffUser: one(staffUser, {
    fields: [staffCredential.staffUserId],
    references: [staffUser.id],
  }),
}));
