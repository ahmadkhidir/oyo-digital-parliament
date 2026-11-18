/**
 * Consent records (`schema.md` Consent, `C-034`, `FEAT-012`).
 *
 * One optional purpose per row, recorded separately from registration, never bundled and never
 * inferred. `schema.md` gives the entity one `granted` flag and a `withdrawn_at` instant with no
 * history entity, and the unique index `consent_member_purpose_key` therefore allows a member one row
 * per purpose: the history of the change is the audit log (`C-090`), not a second product table.
 *
 * Because of that index, `create` is an upsert. A member who withdraws and later grants the same
 * purpose again keeps one row, rewritten to the new grant, and `withdraw` rewrites the same row in
 * place. The assertion is enforced by PostgreSQL, not by the caller remembering to check first.
 */
import { and, asc, eq } from 'drizzle-orm';
import type { Consent, ConsentPort, ConsentPurpose } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { consent } from '../schema/consent.ts';

/** One repository implements the consent port; nothing else writes this table. */
export type ConsentRepository = ConsentPort;

/** Maps a stored row to the domain type, dropping the nulls the domain models as absent. */
function toConsent(row: typeof consent.$inferSelect): Consent {
  const withdrawnAt = row.withdrawnAt ?? undefined;
  return {
    id: row.id,
    memberId: row.memberId,
    purpose: row.purpose,
    granted: row.granted,
    recordedAt: row.recordedAt,
    ...(withdrawnAt === undefined ? {} : { withdrawnAt }),
  };
}

/**
 * Builds the consent repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the consent change and its audit event
 *   already share.
 */
export function createConsentRepository(executor: Executor): ConsentRepository {
  const db = executorOf(executor);

  return {
    async listForMember(memberId) {
      const rows = await db
        .select()
        .from(consent)
        .where(eq(consent.memberId, memberId))
        .orderBy(asc(consent.purpose));
      return rows.map(toConsent);
    },

    async latestForPurpose(memberId, purpose: ConsentPurpose) {
      // At most one row can match (`consent_member_purpose_key`); "latest" is the row's whole life,
      // since a re-grant rewrites it rather than adding a second entry.
      const rows = await db
        .select()
        .from(consent)
        .where(and(eq(consent.memberId, memberId), eq(consent.purpose, purpose)))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toConsent(row);
    },

    async create(record) {
      // Re-granting after a withdrawal must not insert a second row for the same purpose, so the
      // conflict rewrites the existing row with the new grant and clears the withdrawal.
      await db
        .insert(consent)
        .values({
          id: record.id,
          memberId: record.memberId,
          purpose: record.purpose,
          granted: record.granted,
          recordedAt: record.recordedAt,
          withdrawnAt: record.withdrawnAt ?? null,
        })
        .onConflictDoUpdate({
          target: [consent.memberId, consent.purpose],
          set: {
            id: record.id,
            granted: record.granted,
            recordedAt: record.recordedAt,
            withdrawnAt: record.withdrawnAt ?? null,
          },
        });
    },

    async withdraw(consentId, at) {
      // Guarded on the live state so a repeated withdrawal cannot move the recorded instant; the
      // row keeps its identifier and the audit log keeps the history (`C-034`).
      await db
        .update(consent)
        .set({ granted: false, withdrawnAt: at })
        .where(and(eq(consent.id, consentId), eq(consent.granted, true)));
    },
  };
}
