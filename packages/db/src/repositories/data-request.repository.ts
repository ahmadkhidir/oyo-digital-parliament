/**
 * Data requests and the legal-hold check (`schema.md` DataRequest and LegalReview, `C-032`,
 * `C-035`, `C-036`, `C-067`, `FEAT-012`).
 *
 * A request is recorded, then worked through the operator's queue: `received` -> `in_progress` ->
 * `completed` or `refused`, or `deferred_for_legal_hold` when a held item blocks the work. Every
 * transition is a conditional write guarded on the request not already being closed, so two operators
 * resolving the same case cannot both win and a completed request cannot be reopened by a late retry
 * (`C-067`). Nothing here deletes a request: the rights log and the audit log both depend on it.
 *
 * The legal-hold check answers "is any of this member's content under an open legal review?" by
 * reading `LegalReview` through the submission or comment it concerns. It returns only whether a hold
 * exists and the date attached to it, never the held text, the reason or the reviewer.
 *
 * SPECIFICATION GAP: `schema.md` gives `LegalReview` no next-review column; the only date the record
 * holds is `requestedAt`. The deferral's own review date is written in words into
 * `DataRequest.legalHoldNote` by the operator (`C-067`). Until the specification names a review-date
 * property, the case's opening date is reported as the review date so a member is told when the hold
 * was raised; the gap is reported to the coordinator rather than papered over with an invented column.
 */
import { and, asc, desc, eq, inArray, notInArray, or } from 'drizzle-orm';
import type { DataRequest, DataRequestPort, DataRequestStatus, LegalHoldPort } from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { comment } from '../schema/comment.ts';
import { dataRequest } from '../schema/data-request.ts';
import { legalReview } from '../schema/legal-review.ts';
import { submission } from '../schema/submission.ts';

/** The statuses a resolved request can no longer leave (`C-067`). */
const CLOSED_STATUSES: readonly DataRequestStatus[] = ['completed', 'refused'];

/** The statuses `findOpenExport` treats as an export still being prepared (`C-035`). */
const EXPORT_IN_FLIGHT: readonly DataRequestStatus[] = ['received', 'in_progress'];

/** One operator transition, as `C-067` records it. */
export interface DataRequestTransition {
  readonly status: Extract<
    DataRequestStatus,
    'in_progress' | 'completed' | 'deferred_for_legal_hold' | 'refused'
  >;
  /** When the operator acted. Written to `completedAt` only for `completed`. */
  readonly at: string;
  /** The operator. Recorded on every transition so the queue always names who moved the case. */
  readonly completedById: string;
  readonly outcomeReason?: string;
  readonly legalHoldNote?: string;
  readonly fileReference?: string;
}

/**
 * The data-request repository.
 *
 * It implements the two ports the data-rights use cases inject - the request store and the legal-hold
 * check - and adds the operator transition `C-067` writes, which no domain use case has landed yet.
 */
export interface DataRequestRepository extends DataRequestPort, LegalHoldPort {
  /**
   * Moves one request to its next state.
   *
   * A `completed` or `refused` request is final and answers `null`; a case deferred for a legal hold
   * can be worked once the hold is reviewed, so it is not treated as closed.
   *
   * @returns The updated request, or `null` when it does not exist or is already closed.
   */
  transition(requestId: string, input: DataRequestTransition): Promise<DataRequest | null>;
}

/** Maps a stored row to the domain type, dropping the nulls the domain models as absent. */
function toDataRequest(row: typeof dataRequest.$inferSelect): DataRequest {
  const legalHoldNote = row.legalHoldNote ?? undefined;
  const outcomeReason = row.outcomeReason ?? undefined;
  const fileReference = row.fileReference ?? undefined;
  const completedById = row.completedById ?? undefined;
  const completedAt = row.completedAt ?? undefined;
  return {
    id: row.id,
    memberId: row.memberId,
    type: row.type,
    status: row.status,
    ...(legalHoldNote === undefined ? {} : { legalHoldNote }),
    ...(outcomeReason === undefined ? {} : { outcomeReason }),
    ...(fileReference === undefined ? {} : { fileReference }),
    ...(completedById === undefined ? {} : { completedById }),
    requestedAt: row.requestedAt,
    ...(completedAt === undefined ? {} : { completedAt }),
  };
}

/**
 * Builds the data-request repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction completing a deletion, which anonymises the
 *   member and closes the request together (`C-067`).
 */
export function createDataRequestRepository(executor: Executor): DataRequestRepository {
  const db = executorOf(executor);

  return {
    async listForMember(memberId) {
      // Read path: `data_request_member_idx`, newest first, as the member's own record lists them.
      const rows = await db
        .select()
        .from(dataRequest)
        .where(eq(dataRequest.memberId, memberId))
        .orderBy(desc(dataRequest.requestedAt), desc(dataRequest.id));
      return rows.map(toDataRequest);
    },

    async findOpenExport(memberId) {
      // A second export while one is being prepared is refused rather than queued (`C-035`); the
      // deferred state is not "in flight" - the hold has already been explained to the member.
      const rows = await db
        .select()
        .from(dataRequest)
        .where(
          and(
            eq(dataRequest.memberId, memberId),
            eq(dataRequest.type, 'export'),
            inArray(dataRequest.status, [...EXPORT_IN_FLIGHT]),
          ),
        )
        .orderBy(desc(dataRequest.requestedAt))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toDataRequest(row);
    },

    async findById(requestId) {
      const rows = await db
        .select()
        .from(dataRequest)
        .where(eq(dataRequest.id, requestId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : toDataRequest(row);
    },

    async create(request) {
      await db.insert(dataRequest).values({
        id: request.id,
        memberId: request.memberId,
        type: request.type,
        status: request.status,
        legalHoldNote: request.legalHoldNote ?? null,
        outcomeReason: request.outcomeReason ?? null,
        fileReference: request.fileReference ?? null,
        completedById: request.completedById ?? null,
        requestedAt: request.requestedAt,
        completedAt: request.completedAt ?? null,
      });
    },

    async transition(requestId, input) {
      const set: Partial<typeof dataRequest.$inferInsert> = {
        status: input.status,
        // The operator is recorded on every move, so a deferred or refused case still names who
        // handled it (`C-067` prints `completedById` on a deferral too).
        completedById: input.completedById,
      };
      if (input.status === 'completed') set.completedAt = input.at;
      if (input.outcomeReason !== undefined) set.outcomeReason = input.outcomeReason;
      if (input.legalHoldNote !== undefined) set.legalHoldNote = input.legalHoldNote;
      if (input.fileReference !== undefined) set.fileReference = input.fileReference;

      // The guard is in the statement rather than in a read-then-write pair: a request already
      // completed or refused cannot be closed a second time by a racing operator (`C-067`).
      const rows = await db
        .update(dataRequest)
        .set(set)
        .where(
          and(eq(dataRequest.id, requestId), notInArray(dataRequest.status, [...CLOSED_STATUSES])),
        )
        .returning();
      const row = rows[0];
      return row === undefined ? null : toDataRequest(row);
    },

    async findOpenForMember(memberId) {
      // A hold exists while a LegalReview is open on a submission or comment the member authored.
      // `LegalReview` carries one target, so the two joins are mutually exclusive and the OR is safe.
      const rows = await db
        .select({ requestedAt: legalReview.requestedAt })
        .from(legalReview)
        .leftJoin(submission, eq(submission.id, legalReview.submissionId))
        .leftJoin(comment, eq(comment.id, legalReview.commentId))
        .where(
          and(
            eq(legalReview.status, 'open'),
            or(eq(submission.authorId, memberId), eq(comment.authorId, memberId)),
          ),
        )
        .orderBy(asc(legalReview.requestedAt))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : { reviewDate: row.requestedAt };
    },
  };
}
