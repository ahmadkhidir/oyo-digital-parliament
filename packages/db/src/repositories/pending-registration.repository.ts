/**
 * Pending registrations (`schema.md` PendingRegistration, `C-002` to `C-004`, `FEAT-001`).
 *
 * A form submitted before the one-time code is accepted. No Member exists while one of these rows is
 * the only record, and the row is discarded by the 24-hour expiry sweep rather than kept as a lead
 * (`nfr.md` Data lifecycle). The retention window is the domain's decision: `expiresAt` arrives from
 * `pendingRegistrationExpiry`, is stored verbatim, and a resend never extends it (`C-004`), so this
 * adapter only writes the instant it is given.
 *
 * `telephone_number`, `full_name` and `declared_age` are direct identifiers held for the length of
 * the form's life. No read here is exposed outside the identity use cases that wrote the row.
 */
import { eq } from 'drizzle-orm';
import type { PendingRegistration, PendingRegistrationPort } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { pendingRegistration } from '../schema/pending-registration.ts';

/** One repository implements the pending-registration port; nothing else writes this table. */
export type PendingRegistrationRepository = PendingRegistrationPort;

/** Maps a stored row to the domain type, dropping the nulls the domain models as absent. */
function toPendingRegistration(row: typeof pendingRegistration.$inferSelect): PendingRegistration {
  const codeSentAt = row.codeSentAt ?? undefined;
  const verifiedAt = row.verifiedAt ?? undefined;
  return {
    id: row.id,
    telephoneNumber: row.telephoneNumber,
    fullName: row.fullName,
    displayName: row.displayName,
    declaredAge: row.declaredAge,
    locale: row.locale,
    ...(codeSentAt === undefined ? {} : { codeSentAt }),
    expiresAt: row.expiresAt,
    ...(verifiedAt === undefined ? {} : { verifiedAt }),
    createdAt: row.createdAt,
  };
}

/**
 * Builds the pending-registration repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the caller already holds. Confirming a
 *   registration marks this row and creates the Member in one unit of work (`C-003`).
 */
export function createPendingRegistrationRepository(
  executor: Executor,
): PendingRegistrationRepository {
  const db = executorOf(executor);

  return {
    async create(pending) {
      await db.insert(pendingRegistration).values({
        id: pending.id,
        telephoneNumber: pending.telephoneNumber,
        fullName: pending.fullName,
        displayName: pending.displayName,
        declaredAge: pending.declaredAge,
        locale: pending.locale,
        codeSentAt: pending.codeSentAt ?? null,
        expiresAt: pending.expiresAt,
        verifiedAt: pending.verifiedAt ?? null,
        createdAt: pending.createdAt,
      });
    },

    async findById(pendingId) {
      // The caller owns the expiry decision: a lapsed form is still returned so `C-003` can answer
      // REGISTRATION_EXPIRED rather than an indistinguishable "not found".
      const rows = await db
        .select()
        .from(pendingRegistration)
        .where(eq(pendingRegistration.id, pendingId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toPendingRegistration(row);
    },

    async markVerified(pendingId, at) {
      await db
        .update(pendingRegistration)
        .set({ verifiedAt: at })
        .where(eq(pendingRegistration.id, pendingId));
    },

    async recordCodeSent(pendingId, at) {
      // Only the dispatch instant moves. `expires_at` is deliberately absent from the SET list: a
      // resend must not buy the form another 24 hours (`C-004`).
      await db
        .update(pendingRegistration)
        .set({ codeSentAt: at })
        .where(eq(pendingRegistration.id, pendingId));
    },
  };
}
