/**
 * The member-content repository (`schema.md` Submission, Decision, Backing, Comment and LegalReview,
 * `C-032`, `FEAT-012`).
 *
 * Proves the keyset page over the member's own submissions with the live decision joined, that a
 * cursor never crosses into another member's rows, that the held backings collapse to the standing
 * state per proposal, that withheld items carry only the public reference and the member-facing note,
 * and that withdrawal is a state change on the member's rows alone.
 */
import { describe, expect, it } from 'vitest';
import { asc, eq, inArray } from 'drizzle-orm';
import { createMemberContentRepository } from './member-content.repository.ts';
import { backing } from '../schema/backing.ts';
import { comment } from '../schema/comment.ts';
import { legalReview } from '../schema/legal-review.ts';
import { submission } from '../schema/submission.ts';
import {
  T0,
  createDecision,
  createMember,
  createStaffUser,
  createSubmission,
  createTestDatabase,
  createWard,
  testId,
} from '../testing/index.ts';

describe('member content repository', () => {
  it('pages the member’s submissions newest first with the live decision and no foreign row', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const otherMemberId = await createMember(database.db, { wardId });
      const signatoryId = await createStaffUser(database.db);
      const repository = createMemberContentRepository(database.db);

      // An empty record is an empty page, not an error (`C-032`).
      expect(await repository.listSubmissions(memberId, { limit: 20 })).toEqual({
        rows: [],
        nextCursor: null,
      });

      await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000101',
        submittedAt: '2026-11-01T09:00:00Z',
      });
      const middle = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000102',
        submittedAt: '2026-11-02T09:00:00Z',
      });
      await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000103',
        submittedAt: '2026-11-03T09:00:00Z',
        status: 'decided',
      });
      // Another member's newer submission must never enter this member's page.
      await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
        reference: 'ODP-000104',
        submittedAt: '2026-11-04T09:00:00Z',
      });

      // A revised answer: version 2 supersedes version 1, and only the tip is live (`C-044`).
      const firstDecision = await createDecision(database.db, {
        submissionId: middle,
        signatoryId,
        version: 1,
        type: 'decline',
      });
      await createDecision(database.db, {
        submissionId: middle,
        signatoryId,
        version: 2,
        type: 'refer',
        authority: 'Ibadan North Local Government',
        supersedesDecisionId: firstDecision,
      });

      const firstPage = await repository.listSubmissions(memberId, { limit: 2 });
      expect(firstPage.rows).toEqual([
        // `decided` with no published decision reads as a null decision, not a guessed answer.
        { reference: 'ODP-000103', status: 'decided', decision: null },
        {
          reference: 'ODP-000102',
          status: 'awaiting_decision',
          decision: { type: 'refer', authority: 'Ibadan North Local Government' },
        },
      ]);
      expect(firstPage.nextCursor).not.toBeNull();

      const secondPage = await repository.listSubmissions(memberId, {
        ...(firstPage.nextCursor === null ? {} : { cursor: firstPage.nextCursor }),
        limit: 2,
      });
      expect(secondPage.rows).toEqual([
        { reference: 'ODP-000101', status: 'awaiting_decision', decision: null },
      ]);
      expect(secondPage.nextCursor).toBeNull();

      // The cursor names `middle`; the anchor is resolved within the member's scope.
      expect(secondPage.rows.some((row) => row.reference === 'ODP-000104')).toBe(false);

      // A malformed cursor restarts at the first page rather than failing the read.
      const restarted = await repository.listSubmissions(memberId, { cursor: 'cur_nope', limit: 2 });
      expect(restarted.rows.map((row) => row.reference)).toEqual(['ODP-000103', 'ODP-000102']);

      // The middle submission is the one with the revision chain; its earlier version is not live.
      expect((await repository.listSubmissions(memberId, { limit: 20 })).rows).toHaveLength(3);
    } finally {
      await database.dispose();
    }
  });

  it('breaks a same-instant tie by identifier so no row is skipped or repeated', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const repository = createMemberContentRepository(database.db);

      // `submittedAt` is not unique; the contract's `(sortKey, id)` order needs the identifier as
      // the tie-break, or a page boundary between two equal instants would drop one of them.
      await createSubmission(database.db, {
        id: 'sub_0001',
        authorId: memberId,
        wardId,
        reference: 'ODP-000201',
        submittedAt: '2026-11-10T09:00:00Z',
      });
      await createSubmission(database.db, {
        id: 'sub_0002',
        authorId: memberId,
        wardId,
        reference: 'ODP-000202',
        submittedAt: '2026-11-10T09:00:00Z',
      });

      const first = await repository.listSubmissions(memberId, { limit: 1 });
      expect(first.rows.map((row) => row.reference)).toEqual(['ODP-000202']);
      expect(first.nextCursor).not.toBeNull();

      const second = await repository.listSubmissions(memberId, {
        ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
        limit: 1,
      });
      expect(second.rows.map((row) => row.reference)).toEqual(['ODP-000201']);
      expect(second.nextCursor).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('withdraws the member’s submissions in place and leaves another member untouched', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const otherMemberId = await createMember(database.db, { wardId });
      const repository = createMemberContentRepository(database.db);

      const awaiting = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000301',
      });
      const withheld = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000302',
        status: 'withheld',
      });
      const outOfArea = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000303',
        status: 'out_of_area',
      });
      const untouched = await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
        reference: 'ODP-000304',
      });

      const at = '2026-11-20T10:00:00Z';
      expect(await repository.withdrawAuthoredSubmissions(memberId, at)).toBe(3);

      // Removal is a state change: every row stays, marked withdrawn at the supplied instant
      // (`FEAT-012`, `submission_withdrawal_time`).
      const memberRows = await database.db
        .select()
        .from(submission)
        .where(inArray(submission.id, [awaiting, withheld, outOfArea]))
        .orderBy(asc(submission.id));
      expect(memberRows.map((row) => row.status)).toEqual([
        'withdrawn',
        'withdrawn',
        'withdrawn',
      ]);
      expect(memberRows.map((row) => row.withdrawnAt)).toEqual([at, at, at]);

      const otherRows = await database.db
        .select()
        .from(submission)
        .where(eq(submission.id, untouched));
      expect(otherRows[0]?.status).toBe('awaiting_decision');
      expect(otherRows[0]?.withdrawnAt).toBeNull();

      // A second sweep moves nothing and does not rewrite the recorded instant.
      expect(await repository.withdrawAuthoredSubmissions(memberId, '2026-11-21T10:00:00Z')).toBe(0);
      const afterSecond = await database.db
        .select()
        .from(submission)
        .where(eq(submission.id, awaiting));
      expect(afterSecond[0]?.withdrawnAt).toBe(at);
    } finally {
      await database.dispose();
    }
  });

  it('lists one standing backing per proposal with the submission’s current status', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const otherMemberId = await createMember(database.db, { wardId });
      const firstProposal = await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
        reference: 'ODP-000401',
        status: 'awaiting_decision',
      });
      const secondProposal = await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
        reference: 'ODP-000402',
        status: 'decided',
      });
      const foreignProposal = await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
        reference: 'ODP-000403',
      });

      // One proposal backed, withdrawn, then backed again: the member sees one line, not three
      // clicks. An older withdrawn row remains in the table (`backing_active_member_key`).
      await database.db.insert(backing).values([
        {
          id: testId('bkg'),
          submissionId: firstProposal,
          memberId,
          identityStateAtBacking: 'registered',
          wardIdAtBacking: wardId,
          state: 'withdrawn',
          createdAt: '2026-11-01T09:00:00Z',
        },
        {
          id: testId('bkg'),
          submissionId: firstProposal,
          memberId,
          identityStateAtBacking: 'registered',
          wardIdAtBacking: wardId,
          state: 'active',
          createdAt: '2026-11-03T09:00:00Z',
        },
        {
          id: testId('bkg'),
          submissionId: secondProposal,
          memberId,
          identityStateAtBacking: 'checked',
          wardIdAtBacking: wardId,
          state: 'active',
          createdAt: '2026-11-02T09:00:00Z',
        },
        {
          id: testId('bkg'),
          submissionId: foreignProposal,
          memberId: otherMemberId,
          identityStateAtBacking: 'registered',
          wardIdAtBacking: wardId,
          state: 'active',
          createdAt: '2026-11-04T09:00:00Z',
        },
      ]);

      const repository = createMemberContentRepository(database.db);
      expect(await repository.listHeldBackings(memberId)).toEqual([
        {
          submissionReference: 'ODP-000401',
          submissionStatus: 'awaiting_decision',
          backingState: 'active',
        },
        {
          submissionReference: 'ODP-000402',
          submissionStatus: 'decided',
          backingState: 'active',
        },
      ]);
      expect(await repository.listHeldBackings(testId('mbr'))).toEqual([]);
    } finally {
      await database.dispose();
    }
  });

  it('lists withheld items with only the public reference and the member-facing note', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const otherMemberId = await createMember(database.db, { wardId });
      const reviewerId = await createStaffUser(database.db, { role: 'legal_reviewer' });
      const repository = createMemberContentRepository(database.db);

      const withheldSubmission = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000501',
        status: 'withheld',
        submittedAt: '2026-11-19T09:00:00Z',
      });
      const pendingSubmission = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000502',
        status: 'withheld',
        submittedAt: '2026-11-20T09:00:00Z',
      });
      const clearedSubmission = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        reference: 'ODP-000503',
        status: 'awaiting_decision',
        submittedAt: '2026-11-18T09:00:00Z',
      });
      const foreignSubmission = await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
        reference: 'ODP-000504',
        status: 'withheld',
        submittedAt: '2026-11-21T09:00:00Z',
      });
      const heldComment = testId('cmt');
      await database.db.insert(comment).values({
        id: heldComment,
        submissionId: withheldSubmission,
        authorId: memberId,
        body: 'This names a company and repeats a specific allegation about it.',
        status: 'held_for_legal',
        routingFlag: 'named_allegation',
        createdAt: '2026-11-22T09:00:00Z',
      });
      // An ordinary moderation removal is not a legal hold and joins no public note.
      await database.db.insert(comment).values({
        id: testId('cmt'),
        submissionId: withheldSubmission,
        authorId: memberId,
        body: 'A comment removed under a discussion rule.',
        status: 'removed',
        routingFlag: 'abuse_or_threat',
        createdAt: '2026-11-17T09:00:00Z',
      });

      const note = 'Withheld for legal review: unverified allegation against a named company.';
      await database.db.insert(legalReview).values([
        {
          id: testId('lrv'),
          submissionId: withheldSubmission,
          commentId: null,
          requestedById: reviewerId,
          reason: 'The text names a company and repeats an allegation that cannot be defended.',
          status: 'withheld',
          reviewerId,
          outcomeReason: 'Private legal reasoning kept with the case.',
          publicNote: note,
          requestedAt: '2026-11-19T10:00:00Z',
          decidedAt: '2026-11-20T10:00:00Z',
        },
        // Still open: no member-facing sentence exists yet, so it is not reported as withheld.
        {
          id: testId('lrv'),
          submissionId: pendingSubmission,
          commentId: null,
          requestedById: reviewerId,
          reason: 'A new complaint is being checked.',
          status: 'open',
          reviewerId: null,
          outcomeReason: null,
          publicNote: null,
          requestedAt: '2026-11-20T10:00:00Z',
          decidedAt: null,
        },
        {
          id: testId('lrv'),
          submissionId: clearedSubmission,
          commentId: null,
          requestedById: reviewerId,
          reason: 'A named entity was declared.',
          status: 'cleared',
          reviewerId,
          outcomeReason: 'The evidence was supplied.',
          publicNote: 'Reviewed and cleared for publication.',
          requestedAt: '2026-11-18T10:00:00Z',
          decidedAt: '2026-11-18T12:00:00Z',
        },
        {
          id: testId('lrv'),
          submissionId: foreignSubmission,
          commentId: null,
          requestedById: reviewerId,
          reason: 'Another member’s case.',
          status: 'withheld',
          reviewerId,
          outcomeReason: 'Private legal reasoning.',
          publicNote: note,
          requestedAt: '2026-11-21T10:00:00Z',
          decidedAt: '2026-11-21T12:00:00Z',
        },
        {
          id: testId('lrv'),
          submissionId: null,
          commentId: heldComment,
          requestedById: reviewerId,
          reason: 'The comment names a company.',
          status: 'withheld',
          reviewerId,
          outcomeReason: 'Private legal reasoning.',
          publicNote: note,
          requestedAt: '2026-11-22T10:00:00Z',
          decidedAt: '2026-11-22T12:00:00Z',
        },
      ]);

      const heldItems = await repository.listHeldItems(memberId);
      expect(heldItems).toEqual([
        { reference: heldComment, reason: note },
        { reference: 'ODP-000501', reason: note },
      ]);
      // `C-032`: exactly two fields, so no title, body or excerpt travels with the entry.
      for (const item of heldItems) {
        expect(Object.keys(item).sort()).toEqual(['reason', 'reference']);
      }
      expect(JSON.stringify(heldItems)).not.toContain('allegation about it');
      expect(JSON.stringify(heldItems)).not.toContain('Private legal reasoning');

      expect(await repository.listHeldItems(testId('mbr'))).toEqual([]);
    } finally {
      await database.dispose();
    }
  });

  it('does not report a comment whose review has no public note', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const otherMemberId = await createMember(database.db, { wardId });
      const reviewerId = await createStaffUser(database.db, { role: 'legal_reviewer' });
      const repository = createMemberContentRepository(database.db);

      const submissionId = await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
        reference: 'ODP-000601',
      });
      const heldComment = testId('cmt');
      await database.db.insert(comment).values({
        id: heldComment,
        submissionId,
        authorId: memberId,
        body: 'A comment held while the case is open.',
        status: 'held_for_legal',
        routingFlag: 'named_allegation',
        createdAt: T0,
      });
      await database.db.insert(legalReview).values({
        id: testId('lrv'),
        submissionId: null,
        commentId: heldComment,
        requestedById: reviewerId,
        reason: 'A named company is mentioned.',
        status: 'open',
        reviewerId: null,
        outcomeReason: null,
        publicNote: null,
        requestedAt: T0,
        decidedAt: null,
      });

      expect(await repository.listHeldItems(memberId)).toEqual([]);
    } finally {
      await database.dispose();
    }
  });
});
