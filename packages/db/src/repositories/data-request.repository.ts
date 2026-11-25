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
 * The review date a member is shown lives on the deferred request itself: `DataRequest.legalHoldReviewAt`
 * is required by `C-067` when an operator defers a request and is absent otherwise, so the member read
 * (`C-032`), the queue (`C-066`) and the export refusal (`C-036`) read a date rather than a sentence
 * (`screens/13-my-record.md`, `screens/22-data-request-queue.md`).
 *
 * `LegalReview` records only when a case was raised and when it was decided, so the hold check reports
 * the case's opening instant; it is the earliest date the record holds and is never parsed from text.
 */
import { and, asc, desc, eq, inArray, notInArray, or, sql } from 'drizzle-orm';
import type {
  DataRequest,
  DataRequestPort,
  DataRequestQueuePort,
  DataRequestResolutionPort,
  DataRequestStatus,
  DataRequestTransitionInput,
  LegalHoldPort,
} from '@odp/domain';
import { DATA_REQUEST_DUE_DAYS as DUE_DAYS } from '@odp/domain';
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
export type DataRequestTransition = DataRequestTransitionInput;

/** The identifier kind `C-001` assigns to a pagination cursor. */
const CURSOR_PREFIX = 'cur_';
const CURSOR_PATTERN = /^cur_[0-9]{4,26}$/;

function encodeCursor(offset: number): string {
  return `${CURSOR_PREFIX}${String(offset).padStart(6, '0')}`;
}

function decodeCursor(cursor: string | undefined): number {
  if (cursor === undefined || !CURSOR_PATTERN.test(cursor)) return 0;
  const offset = Number.parseInt(cursor.slice(CURSOR_PREFIX.length), 10);
  return Number.isInteger(offset) && offset >= 0 ? offset : 0;
}

/**
 * The statutory due instant of one request (`C-035`, `C-066`).
 *
 * The days come from the domain's own table rather than a second copy here, so the queue's order,
 * its overdue count and the member-facing due date cannot drift apart.
 *
 * The day count is bound as a parameter, and every branch of a parameter-only `CASE` reaches
 * PostgreSQL as the unresolved `unknown` type, which it then resolves to `text`. `make_interval`
 * has no `text` overload, so the whole expression is cast to `integer`: the cast settles the
 * branches' type and PostgreSQL resolves `make_interval(days => integer)` (`C-066`).
 */
const dueAtExpression = sql`${dataRequest.requestedAt} + make_interval(days => (case ${dataRequest.type}::text when 'access' then ${DUE_DAYS.access} when 'correction' then ${DUE_DAYS.correction} when 'export' then ${DUE_DAYS.export} else ${DUE_DAYS.deletion} end)::integer)`;

/**
 * The data-request repository.
 *
 * It implements the two ports the data-rights use cases inject - the request store and the legal-hold
 * check - and the operator queue's read and its conditional transition (`C-066`, `C-067`).
 */
export interface DataRequestRepository
  extends DataRequestPort,
    LegalHoldPort,
    DataRequestQueuePort,
    DataRequestResolutionPort {}

/** Maps a stored row to the domain type, dropping the nulls the domain models as absent. */
function toDataRequest(row: typeof dataRequest.$inferSelect): DataRequest {
  const legalHoldNote = row.legalHoldNote ?? undefined;
  const legalHoldReviewAt = row.legalHoldReviewAt ?? undefined;
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
    ...(legalHoldReviewAt === undefined ? {} : { legalHoldReviewAt }),
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
        legalHoldReviewAt: request.legalHoldReviewAt ?? null,
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
      if (input.status === 'deferred_for_legal_hold') {
        if (input.legalHoldNote !== undefined) set.legalHoldNote = input.legalHoldNote;
        if (input.legalHoldReviewAt !== undefined) {
          set.legalHoldReviewAt = input.legalHoldReviewAt;
        }
      } else {
        // The hold fields exist only while the request is deferred (`schema.md` DataRequest). A
        // request that leaves the deferred state clears them; the audit log keeps who deferred it,
        // when, and why.
        set.legalHoldNote = null;
        set.legalHoldReviewAt = null;
      }
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

    async listQueue(query) {
      const offset = decodeCursor(query.cursor);
      const rows = await db
        .select()
        .from(dataRequest)
        .where(notInArray(dataRequest.status, [...CLOSED_STATUSES]))
        .orderBy(sql`${dueAtExpression} asc`, asc(dataRequest.requestedAt), asc(dataRequest.id))
        .limit(query.limit + 1)
        .offset(offset);

      const page = rows.slice(0, query.limit);
      return {
        requests: page.map(toDataRequest),
        nextCursor: rows.length > query.limit ? encodeCursor(offset + page.length) : null,
      };
    },

    async listOpen() {
      const rows = await db
        .select()
        .from(dataRequest)
        .where(notInArray(dataRequest.status, [...CLOSED_STATUSES]))
        .orderBy(sql`${dueAtExpression} asc`, asc(dataRequest.requestedAt), asc(dataRequest.id));
      return rows.map(toDataRequest);
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
