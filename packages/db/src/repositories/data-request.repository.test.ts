/**
 * The data-request repository and the legal-hold check (`schema.md` DataRequest and LegalReview,
 * `C-032`, `C-035`, `C-036`, `C-067`, `FEAT-012`).
 *
 * Proves the queue ordering, the single-open-export rule, that every operator transition is persisted
 * with its reason and cannot be replayed against a closed request, and that a hold is detected only
 * while a legal review on the member's own content is open.
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDataRequestRepository } from './data-request.repository.ts';
import { legalReview } from '../schema/legal-review.ts';
import {
  T0,
  createMember,
  createStaffUser,
  createSubmission,
  createTestDatabase,
  createWard,
  readDownMigration,
  readMigration,
  testId,
} from '../testing/index.ts';

/** The migration that gives `DataRequest` its structured legal-hold review date (`C-067`). */
const REVIEW_DATE_MIGRATION = '0005_data_request_legal_hold_review_at';

describe('data request repository', () => {
  it('lists requests newest first, finds the open export and resolves it through a guarded transition', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const operatorId = await createStaffUser(database.db, { role: 'operator' });
      const repository = createDataRequestRepository(database.db);

      const openExportId = testId('drq');
      const closedExportId = testId('drq');
      const deletionId = testId('drq');
      await repository.create({
        id: openExportId,
        memberId,
        type: 'export',
        status: 'received',
        requestedAt: '2026-11-21T07:00:00Z',
      });
      await repository.create({
        id: closedExportId,
        memberId,
        type: 'export',
        status: 'completed',
        requestedAt: '2026-11-22T07:00:00Z',
        completedAt: '2026-11-23T07:00:00Z',
        fileReference: 'exports/mbr/2026-11-23.zip',
      });
      await repository.create({
        id: deletionId,
        memberId,
        type: 'deletion',
        status: 'received',
        requestedAt: '2026-11-24T07:00:00Z',
      });

      expect((await repository.listForMember(memberId)).map((row) => row.id)).toEqual([
        deletionId,
        closedExportId,
        openExportId,
      ]);
      expect((await repository.findById(deletionId))?.type).toBe('deletion');
      expect(await repository.findById(testId('drq'))).toBeNull();

      // A second export is refused while one is still being prepared (`C-035`); a completed one is
      // not "open".
      expect((await repository.findOpenExport(memberId))?.id).toBe(openExportId);

      const completed = await repository.transition(openExportId, {
        status: 'completed',
        at: '2026-11-25T07:00:00Z',
        completedById: operatorId,
        fileReference: 'exports/mbr/2026-11-25.zip',
      });
      expect(completed).toMatchObject({
        id: openExportId,
        status: 'completed',
        completedById: operatorId,
        completedAt: '2026-11-25T07:00:00Z',
        fileReference: 'exports/mbr/2026-11-25.zip',
      });
      expect(await repository.findOpenExport(memberId)).toBeNull();

      // A closed request cannot be moved again, and an unknown one does not invent a row.
      expect(
        await repository.transition(openExportId, {
          status: 'in_progress',
          at: '2026-11-26T07:00:00Z',
          completedById: operatorId,
        }),
      ).toBeNull();
      expect(
        await repository.transition(testId('drq'), {
          status: 'in_progress',
          at: '2026-11-26T07:00:00Z',
          completedById: operatorId,
        }),
      ).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('records a deferral with its hold reason and review date, and a refusal with its reason', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const operatorId = await createStaffUser(database.db, { role: 'operator' });
      const repository = createDataRequestRepository(database.db);

      const deferredId = testId('drq');
      await repository.create({
        id: deferredId,
        memberId,
        type: 'deletion',
        status: 'received',
        requestedAt: '2026-11-21T07:00:00Z',
      });
      await repository.transition(deferredId, {
        status: 'deferred_for_legal_hold',
        at: '2026-11-22T10:00:00Z',
        completedById: operatorId,
        outcomeReason: 'One submission is under an open legal review.',
        legalHoldNote: 'Held for legal review, reference ODP-004821.',
        legalHoldReviewAt: '2026-12-19T07:00:00Z',
      });
      // `C-067`, `schema.md` DataRequest: the reason and the review date are separate fields; the
      // note holds no date for anybody to parse.
      expect(await repository.findById(deferredId)).toMatchObject({
        status: 'deferred_for_legal_hold',
        legalHoldNote: 'Held for legal review, reference ODP-004821.',
        legalHoldReviewAt: '2026-12-19T07:00:00Z',
        outcomeReason: 'One submission is under an open legal review.',
        completedById: operatorId,
      });

      // A deferred request can be worked once the hold is reviewed; leaving the deferred state
      // clears the hold fields, which exist only while it is deferred (`schema.md` DataRequest).
      const reopened = await repository.transition(deferredId, {
        status: 'in_progress',
        at: '2026-11-23T09:00:00Z',
        completedById: operatorId,
      });
      expect(reopened?.status).toBe('in_progress');
      expect(reopened?.legalHoldNote).toBeUndefined();
      expect(reopened?.legalHoldReviewAt).toBeUndefined();

      const refusedId = testId('drq');
      await repository.create({
        id: refusedId,
        memberId,
        type: 'access',
        status: 'received',
        requestedAt: '2026-11-21T07:00:00Z',
      });
      await repository.transition(refusedId, {
        status: 'refused',
        at: '2026-11-22T10:00:00Z',
        completedById: operatorId,
        outcomeReason: 'The request repeats one already answered on 2026-11-01.',
      });
      expect((await repository.findById(refusedId))?.outcomeReason).toBe(
        'The request repeats one already answered on 2026-11-01.',
      );
    } finally {
      await database.dispose();
    }
  });

  it('refuses a hold with no review date and a review date outside a hold', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const operatorId = await createStaffUser(database.db, { role: 'operator' });
      const repository = createDataRequestRepository(database.db);

      const withoutReviewDate = testId('drq');
      await repository.create({
        id: withoutReviewDate,
        memberId,
        type: 'deletion',
        status: 'received',
        requestedAt: '2026-11-21T07:00:00Z',
      });
      // `screens/22-data-request-queue.md`: a legal hold cannot be recorded without a review date.
      await expect(
        repository.transition(withoutReviewDate, {
          status: 'deferred_for_legal_hold',
          at: '2026-11-22T10:00:00Z',
          completedById: operatorId,
          legalHoldNote: 'Held for legal review, reference ODP-004821.',
        }),
      ).rejects.toThrow();

      // The column is absent unless the request is deferred (`schema.md` DataRequest).
      await expect(
        repository.create({
          id: testId('drq'),
          memberId,
          type: 'deletion',
          status: 'received',
          requestedAt: '2026-11-21T07:00:00Z',
          legalHoldReviewAt: '2026-12-19T07:00:00Z',
        }),
      ).rejects.toThrow();
    } finally {
      await database.dispose();
    }
  });

  it('detects an open legal hold on the member’s own content and only while it is open', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const otherMemberId = await createMember(database.db, { wardId });
      const reviewerId = await createStaffUser(database.db, { role: 'legal_reviewer' });
      const memberSubmission = await createSubmission(database.db, { authorId: memberId, wardId });
      const otherSubmission = await createSubmission(database.db, {
        authorId: otherMemberId,
        wardId,
      });
      const repository = createDataRequestRepository(database.db);

      expect(await repository.findOpenForMember(memberId)).toBeNull();

      // Another member's open case is not this member's hold.
      await database.db.insert(legalReview).values({
        id: testId('lrv'),
        submissionId: otherSubmission,
        commentId: null,
        requestedById: reviewerId,
        reason: 'This names a company and accuses it of fraud.',
        status: 'open',
        requestedAt: '2026-11-01T10:00:00Z',
      });
      expect(await repository.findOpenForMember(memberId)).toBeNull();

      const reviewId = testId('lrv');
      await database.db.insert(legalReview).values({
        id: reviewId,
        submissionId: memberSubmission,
        commentId: null,
        requestedById: reviewerId,
        reason: 'This names a company and accuses it of fraud.',
        status: 'open',
        requestedAt: '2026-11-18T10:40:00Z',
      });
      expect(await repository.findOpenForMember(memberId)).toEqual({
        reviewDate: '2026-11-18T10:40:00Z',
      });

      // A decided case is no longer a hold.
      await database.db
        .update(legalReview)
        .set({ status: 'cleared', decidedAt: T0 })
        .where(eq(legalReview.id, reviewId));
      expect(await repository.findOpenForMember(memberId)).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('reverses the review-date migration and applies it again', async () => {
    const database = await createTestDatabase();
    try {
      const columnBefore = await database.pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'data_request'
            and column_name = 'legal_hold_review_at'`,
      );
      expect(columnBefore.rows).toHaveLength(1);

      // The down path exists and removes exactly the column and its constraint.
      await database.pool.query(await readDownMigration(REVIEW_DATE_MIGRATION));
      const columnAfterDown = await database.pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'data_request'
            and column_name = 'legal_hold_review_at'`,
      );
      expect(columnAfterDown.rows).toHaveLength(0);

      // The forward migration applies again over the rolled-back shape.
      await database.pool.query(await readMigration(REVIEW_DATE_MIGRATION));
      const columnRestored = await database.pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'data_request'
            and column_name = 'legal_hold_review_at'`,
      );
      expect(columnRestored.rows).toHaveLength(1);
    } finally {
      await database.dispose();
    }
  });
});
