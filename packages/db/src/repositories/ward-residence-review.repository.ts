/**
 * The residence review's persistence adapter (`schema.md` ResidenceReview, `C-055`, `C-057`).
 *
 * One row per review, append-only in practice: a later review is a new row and the latest one is what
 * the member's identity state reflects. `notes` is the reviewer's private working note and is never
 * selected by a public projection.
 *
 * The queue read is not a member register by ward. It scans the members whose ward is recorded and
 * whose residence has not been accepted, orders them by registration date across the state, and
 * returns only the display name, the confirmed ward and that date. No `ward_id` filter exists here,
 * and the schema deliberately carries no index that would make one cheap (`packages/db/AGENTS.md`
 * Discipline, `FEAT-012`).
 */
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type {
  PendingWardResidence,
  ResidenceReview,
  ResidenceReviewPort,
} from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { member } from '../schema/member.ts';
import { residenceReview } from '../schema/residence-review.ts';
import { ward } from '../schema/ward.ts';

/** The identifier kind `C-001` assigns to a pagination cursor. */
const CURSOR_PREFIX = 'cur_';
const CURSOR_PATTERN = /^cur_[0-9]{4,26}$/;

/** One repository implements the residence-review port. */
export type WardResidenceReviewRepository = ResidenceReviewPort;

function encodeCursor(offset: number): string {
  return `${CURSOR_PREFIX}${String(offset).padStart(6, '0')}`;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || !CURSOR_PATTERN.test(cursor)) return 0;
  const offset = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

/**
 * The members awaiting a residence review: ward recorded, still Registered, account live.
 *
 * An anonymised account is excluded because it can never be checked (`C-057` refuses a deleted
 * member); leaving it on the list would leave a case that no reviewer can close.
 */
function pendingFilter() {
  return and(
    eq(member.wardStatus, 'resolved'),
    eq(member.identityState, 'registered'),
    isNull(member.deletedAt),
  );
}

/**
 * Builds the residence-review repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the review is already inside.
 */
export function createWardResidenceReviewRepository(
  executor: Executor,
): WardResidenceReviewRepository {
  const db = executorOf(executor);

  return {
    async record(review: ResidenceReview) {
      await db.insert(residenceReview).values({
        id: review.id,
        memberId: review.memberId,
        reviewerId: review.reviewerId,
        method: review.method,
        notes: review.notes ?? null,
        decision: review.decision,
        reviewedAt: review.reviewedAt,
      });
    },

    async listPending(query) {
      const offset = decodeCursor(query.cursor);

      // Read path: the Residences work type of the ward review queue (`C-055`). Oldest
      // registration first, with the ward joined for its name; the member's display name is the
      // only name in the projection. The limit asks for one extra row to know whether to page.
      const rows = await db
        .select({
          memberId: member.id,
          displayName: member.displayName,
          wardId: ward.id,
          wardName: ward.name,
          registeredAt: member.createdAt,
        })
        .from(member)
        .innerJoin(ward, eq(member.wardId, ward.id))
        .where(pendingFilter())
        .orderBy(asc(member.createdAt), asc(member.id))
        .limit(query.limit + 1)
        .offset(offset);

      const page = rows.slice(0, query.limit);
      const residences: PendingWardResidence[] = page.map((row) => ({
        memberId: row.memberId,
        displayName: row.displayName,
        wardId: row.wardId,
        wardName: row.wardName,
        registeredAt: row.registeredAt,
      }));

      return {
        residences,
        nextCursor: rows.length > query.limit ? encodeCursor(offset + page.length) : null,
      };
    },

    async countPending() {
      const rows = await db.select({ value: count() }).from(member).where(pendingFilter());
      return Number(rows[0]?.value ?? 0);
    },
  };
}
