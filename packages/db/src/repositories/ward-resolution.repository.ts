/**
 * The member and submission side of a ward resolution (`C-011`, `C-056`, `C-057`).
 *
 * A ward action changes the member's own ward and identity state, and - only on a reviewer's
 * resolution - places the member's unresolved in-state submissions in the resolved ward. This adapter
 * carries those three aggregates because the ward rules own the decision; it never writes a
 * submission's `body` or `location_text`, and it never adds an index on `member.ward_id`, which would
 * only serve a member register the platform does not produce (`FEAT-012`).
 */
import { and, asc, count, eq, inArray, ne } from 'drizzle-orm';
import type {
  WardBackingPort,
  WardMemberPort,
  WardMemberState,
  WardSubmissionPort,
  WardSubmissionState,
} from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { backing } from '../schema/backing.ts';
import { member } from '../schema/member.ts';
import { submission } from '../schema/submission.ts';

/** One repository implements the three ward ports that touch the member's own aggregates. */
export type WardResolutionRepository = WardMemberPort & WardSubmissionPort & WardBackingPort;

/**
 * Builds the resolution repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the resolution is already inside, so the
 *   review, the member and the moved submissions commit together.
 */
export function createWardResolutionRepository(executor: Executor): WardResolutionRepository {
  const db = executorOf(executor);

  return {
    async get(memberId): Promise<WardMemberState | null> {
      const rows = await db
        .select({
          id: member.id,
          wardId: member.wardId,
          wardStatus: member.wardStatus,
          identityState: member.identityState,
          deletedAt: member.deletedAt,
        })
        .from(member)
        .where(eq(member.id, memberId))
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      return {
        id: row.id,
        ...(row.wardId === null ? {} : { wardId: row.wardId }),
        wardStatus: row.wardStatus,
        identityState: row.identityState,
        ...(row.deletedAt === null ? {} : { deletedAt: row.deletedAt }),
      };
    },

    async recordWard(memberId, wardId) {
      await db
        .update(member)
        .set({ wardId, wardStatus: 'resolved' })
        .where(eq(member.id, memberId));
    },

    async setIdentityState(memberId, state) {
      await db.update(member).set({ identityState: state }).where(eq(member.id, memberId));
    },

    async listUnresolvedByAuthor(memberId): Promise<readonly WardSubmissionState[]> {
      const rows = await db
        .select({
          id: submission.id,
          reference: submission.reference,
          wardStatus: submission.wardStatus,
          locationScope: submission.locationScope,
          status: submission.status,
        })
        .from(submission)
        .where(and(eq(submission.authorId, memberId), eq(submission.wardStatus, 'unresolved')))
        .orderBy(asc(submission.submittedAt), asc(submission.reference));
      return rows;
    },

    async countWithWardByAuthor(memberId) {
      const rows = await db
        .select({ value: count() })
        .from(submission)
        .where(and(eq(submission.authorId, memberId), eq(submission.wardStatus, 'resolved')));
      return Number(rows[0]?.value ?? 0);
    },

    async assignWard(submissionIds, wardId) {
      if (submissionIds.length === 0) return [];
      // The guards repeat the policy at the statement that writes: a resolved, out-of-area or
      // out-of-state submission is never moved, whatever list the caller built (`C-056`).
      const moved = await db
        .update(submission)
        .set({ wardId, wardStatus: 'resolved' })
        .where(
          and(
            inArray(submission.id, [...submissionIds]),
            eq(submission.wardStatus, 'unresolved'),
            eq(submission.locationScope, 'in_state'),
            ne(submission.status, 'out_of_area'),
          ),
        )
        .returning({ reference: submission.reference });
      return moved.map((row) => row.reference);
    },

    async countByMember(memberId) {
      const rows = await db
        .select({ value: count() })
        .from(backing)
        .where(and(eq(backing.memberId, memberId), eq(backing.state, 'active')));
      return Number(rows[0]?.value ?? 0);
    },
  };
}
