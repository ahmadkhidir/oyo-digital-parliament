/**
 * The member's authored and held record (`schema.md` Submission, Decision, Backing, Comment and
 * LegalReview, `C-032`, `FEAT-012`).
 *
 * This is the persistence half of the My Record read, and it is deliberately narrow: every query
 * starts from the member identifier the use case supplies and never returns a row another member
 * owns. Three reads make up the record:
 *
 * - **Submissions**, newest first, each joined to its *live* decision. A decision is live when no
 *   later decision names it as `supersedesDecisionId` (ADR-002), so a revised answer replaces the
 *   earlier one on the record while the superseded row stays readable elsewhere.
 * - **Backed proposals**, one row per submission the member backed, carrying that backing's current
 *   state and the submission's current status. A member who withdrew and re-backed has one entry,
 *   not a history of clicks.
 * - **Held items**, the member's own submissions and comments that a legal review has withheld or
 *   taken down. The entry carries the public reference and the reviewer's `publicNote`, which is the
 *   member-facing sentence; it never carries the body, a title, an excerpt or the internal
 *   `outcomeReason`, because the member wrote the text and a second copy of material under review is
 *   exactly what `C-032` forbids. A review that is still open has no public note yet, so the item is
 *   not listed as withheld; its status still shows in the submissions list.
 *
 * `listSubmissions` is keyset-paged on the contract's `(sortKey, id)` rule with `sortKey` =
 * `submittedAt`, newest first. The `cur_` cursor carries the last submission identifier; the
 * repository resolves that row's `submittedAt` and pages from the pair, so an insert or a withdrawal
 * between two reads cannot make a row appear twice or vanish from the page boundary.
 */
import { and, desc, eq, inArray, isNotNull, lt, ne, notExists, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type {
  HeldBackingRow,
  HeldItemRow,
  MemberContentPort,
  MemberSubmissionRow,
} from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { backing } from '../schema/backing.ts';
import { comment } from '../schema/comment.ts';
import { decision } from '../schema/decision.ts';
import { legalReview } from '../schema/legal-review.ts';
import { submission } from '../schema/submission.ts';

/** The identifier kind `C-001` assigns to a pagination cursor. */
const CURSOR_PREFIX = 'cur_';
const CURSOR_PATTERN = /^cur_[0-9A-Z]{4,26}$/;
/** The record prefix `C-001` assigns to a Submission, stripped from the cursor body. */
const SUBMISSION_PREFIX = 'sub_';

/** Comment states that keep the item out of publication after a legal decision (`C-054`). */
const HELD_COMMENT_STATUSES = ['held_for_legal', 'removed'] as const;
/** Legal-review outcomes that keep an item out of publication (`C-054`). */
const HELD_REVIEW_STATUSES = ['withheld', 'takedown'] as const;

/** One repository implements the member-content port; nothing else reads this record for a member. */
export type MemberContentRepository = MemberContentPort;

/**
 * Encodes the last submission of a page as a `C-001` cursor.
 *
 * The body is the submission's identifier without its `sub_` prefix: the kind is implied by this
 * read, the value stays opaque to the caller, and the row's `submittedAt` is read back from the
 * record rather than trusted from the cursor.
 */
function encodeCursor(submissionId: string): string {
  const body = submissionId.startsWith(SUBMISSION_PREFIX)
    ? submissionId.slice(SUBMISSION_PREFIX.length)
    : submissionId;
  return `${CURSOR_PREFIX}${body}`;
}

/**
 * Decodes a cursor back to the submission it names.
 *
 * A malformed cursor restarts at the first page rather than failing a member's own record; the same
 * convention serves the ward reference. The identifier is then re-read *with the member's scope*, so
 * a cursor naming another member's row is no anchor and returns the first page instead of leaking a
 * sort key.
 */
function decodeCursor(cursor: string | undefined): string | null {
  if (cursor === undefined || !CURSOR_PATTERN.test(cursor)) return null;
  return `${SUBMISSION_PREFIX}${cursor.slice(CURSOR_PREFIX.length)}`;
}

/**
 * Builds the member-content repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction anonymising a member, so the identifier
 *   removal and the authored submissions changing state commit together (`FEAT-012`).
 */
export function createMemberContentRepository(executor: Executor): MemberContentRepository {
  const db = executorOf(executor);
  // The same table twice: one row is a decision, the other is any later decision that supersedes it.
  const laterDecision = alias(decision, 'later_decision');

  return {
    async listSubmissions(memberId, query) {
      const cursorId = decodeCursor(query.cursor);
      let anchor: { readonly submittedAt: string; readonly id: string } | null = null;
      if (cursorId !== null) {
        const anchors = await db
          .select({ submittedAt: submission.submittedAt, id: submission.id })
          .from(submission)
          .where(and(eq(submission.id, cursorId), eq(submission.authorId, memberId)))
          .limit(1);
        anchor = anchors[0] ?? null;
      }

      // Keyset, not offset: the pair is exactly the contract's `(sortKey, id)` order, so a row
      // published or withdrawn between two page reads cannot shift the boundary.
      const membership = eq(submission.authorId, memberId);
      const afterCursor =
        anchor === null
          ? undefined
          : or(
              lt(submission.submittedAt, anchor.submittedAt),
              and(
                eq(submission.submittedAt, anchor.submittedAt),
                lt(submission.id, anchor.id),
              ),
            );

      const rows = await db
        .select({
          id: submission.id,
          reference: submission.reference,
          status: submission.status,
          decisionType: decision.type,
          decisionAuthority: decision.authority,
        })
        .from(submission)
        .leftJoin(
          decision,
          and(
            eq(decision.submissionId, submission.id),
            // The live answer is the tip of the revision chain (`schema.md` Decision, ADR-002).
            notExists(
              db
                .select({ id: laterDecision.id })
                .from(laterDecision)
                .where(eq(laterDecision.supersedesDecisionId, decision.id)),
            ),
          ),
        )
        .where(afterCursor === undefined ? membership : and(membership, afterCursor))
        // Read path: `submission_author_idx` plus the primary key, newest first (`C-032`).
        .orderBy(desc(submission.submittedAt), desc(submission.id))
        // One extra row answers "is there another page?" without a second count.
        .limit(query.limit + 1);

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        rows: page.map(
          (row): MemberSubmissionRow => ({
            reference: row.reference,
            status: row.status,
            decision:
              row.decisionType === null
                ? null
                : { type: row.decisionType, authority: row.decisionAuthority ?? null },
          }),
        ),
        nextCursor: rows.length > query.limit && last !== undefined ? encodeCursor(last.id) : null,
      };
    },

    async listHeldBackings(memberId) {
      // Read path: `backing_member_idx`. The join carries the submission's public reference and its
      // current status, never the author or the ward the backing was given from.
      const rows = await db
        .select({
          submissionId: backing.submissionId,
          submissionReference: submission.reference,
          submissionStatus: submission.status,
          backingState: backing.state,
        })
        .from(backing)
        .innerJoin(submission, eq(submission.id, backing.submissionId))
        .where(eq(backing.memberId, memberId))
        .orderBy(desc(backing.createdAt), desc(backing.id));

      // One entry per proposal: the newest backing row is the state that stands, so a withdrawal
      // followed by a re-backing reads as active rather than as two contradicting lines.
      const seen = new Set<string>();
      const held: HeldBackingRow[] = [];
      for (const row of rows) {
        if (seen.has(row.submissionId)) continue;
        seen.add(row.submissionId);
        held.push({
          submissionReference: row.submissionReference,
          submissionStatus: row.submissionStatus,
          backingState: row.backingState,
        });
      }
      return held;
    },

    async listHeldItems(memberId) {
      // A submission is out of publication while its status is `withheld` (`C-014`, `C-054`). The
      // public note on the review is the only member-facing sentence in the record; an open review
      // has none yet and is therefore not a held item.
      const submissionRows = await db
        .select({
          itemId: submission.id,
          reference: submission.reference,
          reason: legalReview.publicNote,
          sortAt: submission.submittedAt,
        })
        .from(submission)
        .innerJoin(legalReview, eq(legalReview.submissionId, submission.id))
        .where(
          and(
            eq(submission.authorId, memberId),
            eq(submission.status, 'withheld'),
            inArray(legalReview.status, [...HELD_REVIEW_STATUSES]),
            isNotNull(legalReview.publicNote),
          ),
        )
        .orderBy(
          desc(submission.submittedAt),
          desc(submission.id),
          desc(legalReview.requestedAt),
          desc(legalReview.id),
        );

      // A comment is out of publication while it is held for legal review or removed after a
      // takedown (`C-019`, `C-054`). An ordinary moderation removal joins no public note and drops
      // out, which is right: it is not a legal hold and its reason belongs to the moderation log.
      const commentRows = await db
        .select({
          itemId: comment.id,
          reference: comment.id,
          reason: legalReview.publicNote,
          sortAt: comment.createdAt,
        })
        .from(comment)
        .innerJoin(legalReview, eq(legalReview.commentId, comment.id))
        .where(
          and(
            eq(comment.authorId, memberId),
            inArray(comment.status, [...HELD_COMMENT_STATUSES]),
            inArray(legalReview.status, [...HELD_REVIEW_STATUSES]),
            isNotNull(legalReview.publicNote),
          ),
        )
        .orderBy(
          desc(comment.createdAt),
          desc(comment.id),
          desc(legalReview.requestedAt),
          desc(legalReview.id),
        );

      // At most one entry per item, from the most recent review that withheld it; the order above
      // puts that review first within each item.
      const seen = new Set<string>();
      const held: { reference: string; reason: string; sortAt: string }[] = [];
      for (const row of [...submissionRows, ...commentRows]) {
        if (row.reason === null || seen.has(row.itemId)) continue;
        seen.add(row.itemId);
        held.push({ reference: row.reference, reason: row.reason, sortAt: row.sortAt });
      }

      // `heldItems` is not paginated; a stable order keeps the response reproducible. Newest item
      // first, then the reference so two items written in the same second do not swap between reads.
      held.sort(
        (left, right) =>
          right.sortAt.localeCompare(left.sortAt) || left.reference.localeCompare(right.reference),
      );
      return held.map(
        (row): HeldItemRow => ({ reference: row.reference, reason: row.reason }),
      );
    },

    async withdrawAuthoredSubmissions(memberId, at) {
      // Removal is a state change, never a delete (`FEAT-012`): the row and its words stay, and the
      // author's withdrawal is recorded with its instant. `submission_withdrawal_time` guarantees
      // the status and the instant travel together.
      const rows = await db
        .update(submission)
        .set({ status: 'withdrawn', withdrawnAt: at })
        .where(and(eq(submission.authorId, memberId), ne(submission.status, 'withdrawn')))
        .returning({ id: submission.id });
      return rows.length;
    },
  };
}
