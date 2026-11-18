/**
 * The durable idempotency store (ADR-002, `C-001`).
 *
 * The rule the suite has to prove is transactional: a claim and the business change commit together,
 * a replay returns the stored response instead of repeating the effect, a key reused with a different
 * payload is a conflict, and a rolled-back attempt leaves no claim behind. Durability is checked by
 * replaying through a second pool, which is what a retry after a process restart looks like.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  claimIdempotencyKey,
  completeIdempotencyClaim,
  fingerprintRequest,
  purgeExpiredIdempotencyRecords,
} from '../../src/idempotency/index.ts';
import * as schema from '../../src/schema/index.ts';
import { createTestDatabase, withTestTransaction } from '../../src/testing/index.ts';

const SCOPE = 'submission.publish';
const KEY = '9f1c2d34-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const NOW = '2026-01-05T09:00:00Z';
const EXPIRES = '2026-01-06T09:00:00Z';

describe('idempotency store', () => {
  it('claims once and replays the stored response', async () => {
    const database = await createTestDatabase();
    try {
      const fingerprint = fingerprintRequest({ reference: 'ODP-004821' });

      const claimed = await withTestTransaction(database, async (scope) => {
        const result = await claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint,
          now: NOW,
          expiresAt: EXPIRES,
        });
        expect(result).toEqual({ kind: 'claimed' });
        await completeIdempotencyClaim(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint,
          response: { submissionId: 'sub_0001' },
        });
      });
      expect(claimed).toBeUndefined();

      const replay = await withTestTransaction(database, (scope) =>
        claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint,
          now: NOW,
          expiresAt: EXPIRES,
        }),
      );
      expect(replay).toEqual({ kind: 'replay', response: { submissionId: 'sub_0001' } });

      // Replaying through a second pool proves the response is durable, not connection-local.
      const secondPool = new Pool({ connectionString: database.connectionString, max: 2 });
      try {
        const secondDb = drizzle(secondPool, { schema });
        const durable = await claimIdempotencyKey(secondDb, {
          scope: SCOPE,
          key: KEY,
          fingerprint,
          now: NOW,
          expiresAt: EXPIRES,
        });
        expect(durable).toEqual({ kind: 'replay', response: { submissionId: 'sub_0001' } });
      } finally {
        await secondPool.end();
      }
    } finally {
      await database.dispose();
    }
  });

  it('refuses the same key with a different fingerprint', async () => {
    const database = await createTestDatabase();
    try {
      await withTestTransaction(database, async (scope) => {
        await claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint: fingerprintRequest({ reference: 'ODP-004821' }),
          now: NOW,
          expiresAt: EXPIRES,
        });
      });

      const conflict = await withTestTransaction(database, (scope) =>
        claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint: fingerprintRequest({ reference: 'ODP-999999' }),
          now: NOW,
          expiresAt: EXPIRES,
        }),
      );
      expect(conflict).toEqual({ kind: 'conflict' });
    } finally {
      await database.dispose();
    }
  });

  it('releases the claim when the business transaction rolls back', async () => {
    const database = await createTestDatabase();
    try {
      const fingerprint = fingerprintRequest({ reference: 'ODP-004821' });

      await expect(
        withTestTransaction(database, async (scope) => {
          await claimIdempotencyKey(scope, {
            scope: SCOPE,
            key: KEY,
            fingerprint,
            now: NOW,
            expiresAt: EXPIRES,
          });
          throw new Error('business write failed');
        }),
      ).rejects.toThrow('business write failed');

      const afterRollback = await withTestTransaction(database, (scope) =>
        claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint,
          now: NOW,
          expiresAt: EXPIRES,
        }),
      );
      expect(afterRollback).toEqual({ kind: 'claimed' });
    } finally {
      await database.dispose();
    }
  });

  it('lets a key be claimed again once its window has passed', async () => {
    const database = await createTestDatabase();
    try {
      const fingerprint = fingerprintRequest({ reference: 'ODP-004821' });
      await withTestTransaction(database, (scope) =>
        claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint,
          now: NOW,
          expiresAt: EXPIRES,
        }),
      );

      const afterWindow = await withTestTransaction(database, (scope) =>
        claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint,
          now: '2026-01-07T09:00:00Z',
          expiresAt: '2026-01-08T09:00:00Z',
        }),
      );
      expect(afterWindow).toEqual({ kind: 'claimed' });
    } finally {
      await database.dispose();
    }
  });

  it('purges expired records and leaves live ones', async () => {
    const database = await createTestDatabase();
    try {
      await withTestTransaction(database, async (scope) => {
        await claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: KEY,
          fingerprint: fingerprintRequest({ a: 1 }),
          now: NOW,
          expiresAt: EXPIRES,
        });
        await claimIdempotencyKey(scope, {
          scope: SCOPE,
          key: 'live-key',
          fingerprint: fingerprintRequest({ a: 2 }),
          now: NOW,
          expiresAt: '2026-02-01T00:00:00Z',
        });
      });

      const removed = await purgeExpiredIdempotencyRecords(database.db, '2026-01-10T00:00:00Z');
      expect(removed).toBe(1);

      const remaining = await database.pool.query<{ key: string }>(
        'select key from idempotency_record',
      );
      expect(remaining.rows.map((row) => row.key)).toEqual(['live-key']);
    } finally {
      await database.dispose();
    }
  });

  it('fails loudly when a response is completed without a claim', async () => {
    const database = await createTestDatabase();
    try {
      await expect(
        withTestTransaction(database, (scope) =>
          completeIdempotencyClaim(scope, {
            scope: SCOPE,
            key: KEY,
            fingerprint: fingerprintRequest({}),
            response: {},
          }),
        ),
      ).rejects.toThrow('No idempotency claim exists');
    } finally {
      await database.dispose();
    }
  });
});
