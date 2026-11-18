/**
 * The consent repository (`schema.md` Consent, `C-034`, `FEAT-012`).
 *
 * Proves the one-row-per-purpose rule the unique index enforces: a withdrawal rewrites the row in
 * place, and a later grant replaces it rather than adding a second row, so the member's own record
 * always shows their current answer. The change history belongs to the audit log, not this table.
 */
import { describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
import { createConsentRepository } from './consent.repository.ts';
import { consent } from '../schema/consent.ts';
import { T0, createMember, createTestDatabase, testId } from '../testing/index.ts';

describe('consent repository', () => {
  it('records a grant, withdraws it in place and replaces it on a later grant', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const repository = createConsentRepository(database.db);
      const grantedId = testId('cns');

      await repository.create({
        id: grantedId,
        memberId,
        purpose: 'record_transfer',
        granted: true,
        recordedAt: T0,
      });
      expect(await repository.latestForPurpose(memberId, 'record_transfer')).toMatchObject({
        id: grantedId,
        granted: true,
      });
      expect((await repository.listForMember(memberId)).length).toBe(1);

      await repository.withdraw(grantedId, '2026-02-01T09:00:00Z');
      const withdrawn = await repository.latestForPurpose(memberId, 'record_transfer');
      expect(withdrawn).toMatchObject({
        id: grantedId,
        granted: false,
        withdrawnAt: '2026-02-01T09:00:00Z',
      });

      // A repeated withdrawal cannot move the recorded instant.
      await repository.withdraw(grantedId, '2026-03-01T09:00:00Z');
      expect((await repository.latestForPurpose(memberId, 'record_transfer'))?.withdrawnAt).toBe(
        '2026-02-01T09:00:00Z',
      );

      // Granting again replaces the row: one row per purpose, and the withdrawal is cleared.
      const regrantedId = testId('cns');
      await repository.create({
        id: regrantedId,
        memberId,
        purpose: 'record_transfer',
        granted: true,
        recordedAt: '2026-04-01T09:00:00Z',
      });
      expect(await repository.latestForPurpose(memberId, 'record_transfer')).toMatchObject({
        id: regrantedId,
        granted: true,
        recordedAt: '2026-04-01T09:00:00Z',
      });
      expect(
        (await repository.latestForPurpose(memberId, 'record_transfer'))?.withdrawnAt,
      ).toBeUndefined();

      const rows = await database.db
        .select({ value: count() })
        .from(consent)
        .where(eq(consent.memberId, memberId));
      expect(Number(rows[0]?.value ?? 0)).toBe(1);
    } finally {
      await database.dispose();
    }
  });

  it('keeps each purpose separate and reports an unanswered one as absent', async () => {
    const database = await createTestDatabase();
    try {
      const memberId = await createMember(database.db);
      const repository = createConsentRepository(database.db);
      await repository.create({
        id: testId('cns'),
        memberId,
        purpose: 'decision_notices',
        granted: true,
        recordedAt: T0,
      });
      await repository.create({
        id: testId('cns'),
        memberId,
        purpose: 'assisted_recording',
        granted: true,
        recordedAt: T0,
      });

      // PostgreSQL orders an enum column by its declaration order (`decision_notices`,
      // `record_transfer`, `assisted_recording`), which keeps the member's own list stable.
      expect((await repository.listForMember(memberId)).map((row) => row.purpose)).toEqual([
        'decision_notices',
        'assisted_recording',
      ]);
      expect(await repository.latestForPurpose(memberId, 'record_transfer')).toBeNull();
    } finally {
      await database.dispose();
    }
  });
});
