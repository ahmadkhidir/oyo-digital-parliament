/**
 * Record integrity (`packages/db/AGENTS.md` Discipline: "real references, justified indexes").
 *
 * These are the constraints a caller must not be able to talk its way past: the required fields of a
 * proposal, a resolved ward reference, one active backing per member, one reservation per member and
 * session, the single target of a legal case, and the published note a takedown owes the ledger.
 * Every assertion is a database refusal, not a repository branch.
 */
import { describe, expect, it } from 'vitest';
import { backing } from '../../src/schema/backing.ts';
import { legalReview } from '../../src/schema/legal-review.ts';
import { reservation } from '../../src/schema/reservation.ts';
import { session } from '../../src/schema/session.ts';
import { submission } from '../../src/schema/submission.ts';
import {
  T0,
  createMember,
  createStaffUser,
  createSubmission,
  createTestDatabase,
  createWard,
  testId,
} from '../../src/testing/index.ts';

describe('record integrity', () => {
  it('refuses a proposal without a cost band and a responsible authority', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });

      await expect(
        database.db.insert(submission).values({
          id: testId('sub'),
          reference: 'ODP-900001',
          authorId: memberId,
          recorderId: null,
          wardId,
          wardStatus: 'resolved',
          type: 'proposal',
          body: 'A new borehole for the ward, costed and dated, with the owner named.',
          pillar: 'infrastructure',
          locationText: 'Agbowo',
          locationScope: 'in_state',
          costBand: null,
          responsibleAuthority: null,
          status: 'awaiting_decision',
          containsNamedEntity: false,
          source: 'web',
          submittedAt: T0,
          withdrawnAt: null,
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
    } finally {
      await database.dispose();
    }
  });

  it('refuses a submission marked resolved with no ward, and a member in the same state', async () => {
    const database = await createTestDatabase();
    try {
      await expect(
        database.db.insert(submission).values({
          id: testId('sub'),
          reference: 'ODP-900002',
          authorId: await createMember(database.db),
          recorderId: null,
          wardId: null,
          wardStatus: 'resolved',
          type: 'issue',
          body: 'A submission that claims a ward it does not name, which the database refuses.',
          pillar: 'health',
          locationText: 'Somewhere',
          locationScope: 'in_state',
          costBand: null,
          responsibleAuthority: null,
          status: 'awaiting_decision',
          containsNamedEntity: false,
          source: 'web',
          submittedAt: T0,
          withdrawnAt: null,
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
    } finally {
      await database.dispose();
    }
  });

  it('permits one active backing and allows re-backing after withdrawal', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const submissionId = await createSubmission(database.db, { authorId: memberId, wardId });

      const backingId = testId('bkg');
      await database.db.insert(backing).values({
        id: backingId,
        submissionId,
        memberId,
        identityStateAtBacking: 'registered',
        wardIdAtBacking: wardId,
        state: 'active',
        createdAt: T0,
      });

      await expect(
        database.db.insert(backing).values({
          id: testId('bkg'),
          submissionId,
          memberId,
          identityStateAtBacking: 'registered',
          wardIdAtBacking: wardId,
          state: 'active',
          createdAt: T0,
        }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });

      // Withdrawal is a state change, and the partial index no longer covers the row.
      await database.pool.query("update backing set state = 'withdrawn' where id = $1", [
        backingId,
      ]);
      await expect(
        database.db.insert(backing).values({
          id: testId('bkg'),
          submissionId,
          memberId,
          identityStateAtBacking: 'checked',
          wardIdAtBacking: wardId,
          state: 'active',
          createdAt: T0,
        }),
      ).resolves.toBeDefined();
    } finally {
      await database.dispose();
    }
  });

  it('refuses one member holding two reservations for the same session', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const sessionId = testId('ses');
      await database.db.insert(session).values({
        id: sessionId,
        title: 'Ibadan North session',
        localGovernmentArea: 'Ibadan North',
        venue: 'Community hall',
        startsAt: T0,
        capacity: 40,
        status: 'scheduled',
        cancellationReason: null,
        rescheduledFromId: null,
        recordPublishedAt: null,
      });

      await database.db.insert(reservation).values({
        id: testId('rsv'),
        sessionId,
        memberId,
        status: 'reserved',
        waitlistPosition: null,
        createdAt: T0,
      });

      await expect(
        database.db.insert(reservation).values({
          id: testId('rsv'),
          sessionId,
          memberId,
          status: 'waitlisted',
          waitlistPosition: 1,
          createdAt: T0,
        }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });
    } finally {
      await database.dispose();
    }
  });

  it('requires exactly one target and a public note for a withheld legal case', async () => {
    const database = await createTestDatabase();
    try {
      const staffId = await createStaffUser(database.db);
      const memberId = await createMember(database.db);
      const submissionId = await createSubmission(database.db, { authorId: memberId });

      await expect(
        database.db.insert(legalReview).values({
          id: testId('lgl'),
          submissionId,
          commentId: null,
          requestedById: staffId,
          reason: 'A named company is accused of a specific act.',
          status: 'withheld',
          reviewerId: null,
          outcomeReason: null,
          publicNote: null,
          requestedAt: T0,
          decidedAt: null,
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });

      // With a public note the same case is accepted: the note is what the ledger owes a reader.
      await expect(
        database.db.insert(legalReview).values({
          id: testId('lgl'),
          submissionId,
          commentId: null,
          requestedById: staffId,
          reason: 'A named company is accused of a specific act.',
          status: 'withheld',
          reviewerId: null,
          outcomeReason: null,
          publicNote: 'Withheld while the legal review runs.',
          requestedAt: T0,
          decidedAt: null,
        }),
      ).resolves.toBeDefined();
    } finally {
      await database.dispose();
    }
  });

  it('keeps one ward per name and local government area', async () => {
    const database = await createTestDatabase();
    try {
      await createWard(database.db, { name: 'Agbowo', localGovernmentArea: 'Ibadan North' });
      await expect(
        createWard(database.db, { name: 'Agbowo', localGovernmentArea: 'Ibadan North' }),
      ).rejects.toMatchObject({ cause: { code: '23505' } });
    } finally {
      await database.dispose();
    }
  });

  it('requires an organiser attestation to name its attester and time', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const staffId = await createStaffUser(database.db);

      await expect(
        database.pool.query(
          "update member set verification_method = 'organiser_attestation' where id = $1",
          [memberId],
        ),
      ).rejects.toMatchObject({ code: '23514' });

      await expect(
        database.pool.query(
          "update member set verification_method = 'organiser_attestation', attested_by_id = $2, attested_at = $3 where id = $1",
          [memberId, staffId, T0],
        ),
      ).resolves.toBeDefined();
    } finally {
      await database.dispose();
    }
  });
});
