/**
 * The pending-registration repository (`C-002` to `C-004`, `FEAT-001`).
 *
 * Proves the row round-trips every field the form holds, that verification is recorded, and that a
 * resend moves only the dispatch instant: the 24-hour retention window is set once when the form is
 * created and a resend never buys it more time (`C-004`).
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPendingRegistrationRepository } from './pending-registration.repository.ts';
import { pendingRegistration } from '../schema/pending-registration.ts';
import { createTestDatabase, testId } from '../testing/index.ts';

describe('pending registration repository', () => {
  it('stores the form, reads it back and records verification', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createPendingRegistrationRepository(database.db);
      const id = testId('prg');
      await repository.create({
        id,
        telephoneNumber: '+2348031234567',
        fullName: 'Oluwaseun Adeyemi',
        displayName: 'Seun A.',
        declaredAge: 24,
        locale: 'yo-NG',
        expiresAt: '2026-11-19T09:16:00Z',
        createdAt: '2026-11-18T09:16:00Z',
      });

      const stored = await repository.findById(id);
      expect(stored).toMatchObject({
        id,
        telephoneNumber: '+2348031234567',
        fullName: 'Oluwaseun Adeyemi',
        displayName: 'Seun A.',
        declaredAge: 24,
        locale: 'yo-NG',
        expiresAt: '2026-11-19T09:16:00Z',
        createdAt: '2026-11-18T09:16:00Z',
      });
      // The optional instants are absent rather than null, as the domain models them.
      expect(stored?.codeSentAt).toBeUndefined();
      expect(stored?.verifiedAt).toBeUndefined();

      await repository.markVerified(id, '2026-11-18T09:20:00Z');
      expect((await repository.findById(id))?.verifiedAt).toBe('2026-11-18T09:20:00Z');
      expect(await repository.findById(testId('prg'))).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('moves only the dispatch instant on a resend and keeps the original expiry', async () => {
    const database = await createTestDatabase();
    try {
      const repository = createPendingRegistrationRepository(database.db);
      const id = testId('prg');
      await repository.create({
        id,
        telephoneNumber: '+2348031234567',
        fullName: 'Oluwaseun Adeyemi',
        displayName: 'Seun A.',
        declaredAge: 24,
        locale: 'en-NG',
        expiresAt: '2026-11-19T09:16:00Z',
        createdAt: '2026-11-18T09:16:00Z',
      });

      await repository.recordCodeSent(id, '2026-11-18T09:40:00Z');
      const rows = await database.db
        .select()
        .from(pendingRegistration)
        .where(eq(pendingRegistration.id, id));
      expect(rows[0]?.codeSentAt).toBe('2026-11-18T09:40:00Z');
      // The window is fixed at creation: a frantic resident cannot extend it by asking again.
      expect(rows[0]?.expiresAt).toBe('2026-11-19T09:16:00Z');
    } finally {
      await database.dispose();
    }
  });
});
