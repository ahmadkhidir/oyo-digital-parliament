/**
 * PendingRegistration (`schema.md` PendingRegistration).
 *
 * A self-registering resident's form before the one-time code is accepted; no Member account exists
 * until then. Retention is 24 hours or until the code is accepted (`nfr.md` Data lifecycle), which is
 * why `expires_at` carries an index for the expiry sweep.
 *
 * `telephone_number`, `full_name` and `declared_age` are personal data (direct identifiers). The
 * one-time code itself is deliberately absent: `schema.md` defines no code field, and the code lives
 * in the short-lived cache rather than the record.
 */
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, smallint, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { locale } from './enums.ts';

export const pendingRegistration = pgTable(
  'pending_registration',
  {
    id: text('id').primaryKey(),
    /** Personal data — direct identifier. The number the code is sent to. */
    telephoneNumber: varchar('telephone_number', { length: 20 }).notNull(),
    /** Personal data — direct identifier. The name entered before verification. */
    fullName: varchar('full_name', { length: 160 }).notNull(),
    displayName: varchar('display_name', { length: 60 }).notNull(),
    /** Personal data. Checked against the 18-to-35 band. */
    declaredAge: smallint('declared_age').notNull(),
    locale: locale('locale').notNull(),
    codeSentAt: utcTimestamp('code_sent_at'),
    expiresAt: utcTimestamp('expires_at').notNull(),
    verifiedAt: utcTimestamp('verified_at'),
    createdAt: utcTimestamp('created_at').notNull(),
  },
  (t) => [
    check('pending_registration_id_format', isIdentifier(t.id)),
    check('pending_registration_telephone_format', sql`${t.telephoneNumber} ~ '^\\+234[0-9]{10}$'`),
    check('pending_registration_age_band', sql`${t.declaredAge} between 18 and 35`),
    // Read path: the 24-hour expiry sweep that discards an unverified form (nfr.md Data lifecycle).
    index('pending_registration_expires_idx').on(t.expiresAt),
    // Read path: a resend or a second attempt finds the live form by number (`C-002`, `C-004`).
    index('pending_registration_telephone_idx').on(t.telephoneNumber),
  ],
);

export const pendingRegistrationRelations = relations(pendingRegistration, () => ({}));
