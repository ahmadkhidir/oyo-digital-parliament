/**
 * Member accounts (`schema.md` Member, `C-032`, `C-033`, `FEAT-001`, `FEAT-012`).
 *
 * This is the one write path for a member's personal data, and it is deliberately narrow: an account
 * is looked up by its identifier, or by the number a code was proved against. There is **no** method
 * that lists members by ward, by local government area or by any other grouping, and there never may
 * be - `FEAT-012` makes that operation absent rather than forbidden, so a caller cannot reach it and
 * a reviewer can see it does not exist. `packages/db/src/schema/member.ts` carries the same rule in
 * its index list: no index on `ward_id` is declared.
 *
 * Accounts that share a handset are never merged. `findByTelephone` returns every live account on the
 * number and `markSharedNumber` flags them all, which is what lets `C-005`/`C-006` ask which account
 * is acting after the code is accepted (`FEAT-001`).
 *
 * Deletion is a state change, not a delete (`FEAT-012`): `anonymise` replaces the three direct
 * identifiers with reserved non-identifying values, stamps `deleted_at`, and leaves the row so the
 * public record keeps a non-identifying author reference.
 */
import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm';
import type { MemberPort, MemberRecord } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { comment } from '../schema/comment.ts';
import { member } from '../schema/member.ts';
import { submission } from '../schema/submission.ts';

/**
 * The values the **read projection** carries for a deleted row's direct identifiers.
 *
 * `schema.md` states that deletion removes a direct identifier by setting it to null, and
 * {@link anonymise} does exactly that. The identity domain type (`MemberRecord`) still declares these
 * three as non-null strings, and that module is not this package's to change; a deleted account is
 * therefore projected with reserved, obviously non-identifying values rather than a null the domain
 * cannot represent. None of them is a real number, name or age: the number is unallocated, the name is
 * a label, and the age is the floor of the band. When the domain type admits null these constants go,
 * and the stored row is already correct.
 */
const ANONYMISED_TELEPHONE_NUMBER = '+2340000000000';
const ANONYMISED_FULL_NAME = 'Deleted member';
const ANONYMISED_DECLARED_AGE = 18;

/** One repository implements the member port; nothing else writes the account row. */
export type MemberRepository = MemberPort;

/** Maps a stored row to the domain type, dropping the nulls the domain models as absent. */
function toMemberRecord(row: typeof member.$inferSelect): MemberRecord {
  const wardId = row.wardId ?? undefined;
  const attestedById = row.attestedById ?? undefined;
  const attestedAt = row.attestedAt ?? undefined;
  const deletedAt = row.deletedAt ?? undefined;
  return {
    id: row.id,
    telephoneNumber: row.telephoneNumber ?? ANONYMISED_TELEPHONE_NUMBER,
    fullName: row.fullName ?? ANONYMISED_FULL_NAME,
    displayName: row.displayName,
    declaredAge: row.declaredAge ?? ANONYMISED_DECLARED_AGE,
    ...(wardId === undefined ? {} : { wardId }),
    wardStatus: row.wardStatus,
    identityState: row.identityState,
    verificationMethod: row.verificationMethod,
    sharedNumber: row.sharedNumber,
    ...(attestedById === undefined ? {} : { attestedById }),
    ...(attestedAt === undefined ? {} : { attestedAt }),
    locale: row.locale,
    createdAt: row.createdAt,
    ...(deletedAt === undefined ? {} : { deletedAt }),
  };
}

/**
 * Builds the member repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction confirming the registration, changing the
 *   profile or anonymising the account.
 */
export function createMemberRepository(executor: Executor): MemberRepository {
  const db = executorOf(executor);

  return {
    async findByTelephone(telephoneNumber) {
      // Read path: `member_telephone_idx`, then the oldest account first (`C-005`). An anonymised row
      // is not a sign-in account, so it is excluded here rather than filtered by every caller.
      const rows = await db
        .select()
        .from(member)
        .where(and(eq(member.telephoneNumber, telephoneNumber), isNull(member.deletedAt)))
        .orderBy(asc(member.createdAt), asc(member.id));
      return rows.map(toMemberRecord);
    },

    async get(memberId) {
      const rows = await db.select().from(member).where(eq(member.id, memberId)).limit(1);
      const row = rows[0];
      return row === undefined ? null : toMemberRecord(row);
    },

    async create(record) {
      await db.insert(member).values({
        id: record.id,
        telephoneNumber: record.telephoneNumber,
        fullName: record.fullName,
        displayName: record.displayName,
        declaredAge: record.declaredAge,
        wardId: record.wardId ?? null,
        wardStatus: record.wardStatus,
        identityState: record.identityState,
        verificationMethod: record.verificationMethod,
        sharedNumber: record.sharedNumber,
        attestedById: record.attestedById ?? null,
        attestedAt: record.attestedAt ?? null,
        locale: record.locale,
        createdAt: record.createdAt,
        deletedAt: record.deletedAt ?? null,
      });
    },

    async markSharedNumber(telephoneNumber) {
      // Every live account on the number is flagged; the rows stay separate (`FEAT-001`).
      await db
        .update(member)
        .set({ sharedNumber: true })
        .where(and(eq(member.telephoneNumber, telephoneNumber), isNull(member.deletedAt)));
    },

    async updateProfile(memberId, input) {
      // The three fields `C-033` may change, and only those. The telephone number, declared age and
      // identity state are not writable through a profile correction.
      await db
        .update(member)
        .set({
          displayName: input.displayName,
          fullName: input.fullName,
          locale: input.locale,
        })
        .where(eq(member.id, memberId));
    },

    async isDisplayNameTaken(displayName, exceptMemberId) {
      // Names are matched case-insensitively so "Seun A." and "seun a." are the same published name.
      const conditions = [
        isNull(member.deletedAt),
        sql`lower(${member.displayName}) = lower(${displayName})`,
      ];
      if (exceptMemberId !== undefined) conditions.push(ne(member.id, exceptMemberId));
      const rows = await db
        .select({ id: member.id })
        .from(member)
        .where(and(...conditions))
        .limit(1);
      return rows.length > 0;
    },

    async anonymise(memberId, at) {
      // Deletion removes the direct identifiers by setting them to null (`schema.md` Member,
      // `FEAT-012`) and stamps when, in one statement. The row and its identifier stay, so every
      // submission, comment and backing keeps a non-identifying author reference. The guard makes a
      // second call a no-op rather than moving `deleted_at` forward: the first deletion is the
      // recorded one.
      await db
        .update(member)
        .set({
          telephoneNumber: null,
          fullName: null,
          declaredAge: null,
          deletedAt: at,
        })
        .where(and(eq(member.id, memberId), isNull(member.deletedAt)));
    },

    async countAuthoredContent(memberId) {
      // Read path: `submission_author_idx`; the comment count is scoped by author for `C-033`.
      const [submissions, comments] = await Promise.all([
        db.select({ value: count() }).from(submission).where(eq(submission.authorId, memberId)),
        db.select({ value: count() }).from(comment).where(eq(comment.authorId, memberId)),
      ]);
      return {
        submissions: Number(submissions[0]?.value ?? 0),
        comments: Number(comments[0]?.value ?? 0),
      };
    },
  };
}
