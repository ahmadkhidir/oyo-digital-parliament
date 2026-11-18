/**
 * The durable idempotency store (ADR-002, `C-001`).
 *
 * Every write the domain declares idempotent claims a `(scope, key)` before it does its work and
 * stores the original response in the **same transaction** as the business change. A replay finds the
 * completed record and returns the stored response; a reused key with a different fingerprint is a
 * conflict; a second caller that arrives while the first transaction is open waits on the row lock
 * and then observes the committed outcome.
 *
 * The store is infrastructure (see `schema/idempotency-record.ts`). It is not a history: a record is
 * purged once its operational window passes, and `purgeExpired` is the only removal path.
 */
import { and, eq, lte } from 'drizzle-orm';
import { executorOf, type Executor } from '../client.ts';
import { idempotencyRecord } from '../schema/idempotency-record.ts';

/** What a claim needs. */
export interface ClaimInput {
  /** The surface or job the key belongs to, for example `submission.publish`. */
  readonly scope: string;
  /** The `Idempotency-Key`, or a worker job's stable run key. */
  readonly key: string;
  /** `fingerprintRequest` of the request payload. */
  readonly fingerprint: string;
  /** The caller's clock, as a `C-001` instant. */
  readonly now: string;
  /** When the key may be forgotten. `C-001` fixes 24 hours for an `Idempotency-Key`. */
  readonly expiresAt: string;
}

/** The outcome of a claim. */
export type ClaimResult =
  | { readonly kind: 'claimed' }
  | { readonly kind: 'replay'; readonly response: unknown }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'in_progress' };

/**
 * Claims a key for the current transaction.
 *
 * Call this inside the transaction that performs the business change: a rollback then releases the
 * claim with no cleanup, and a commit makes the claim and the change visible together.
 *
 * @returns `claimed` when the caller owns the key, `replay` when a completed response exists,
 * `conflict` when the key was used for a different payload, and `in_progress` when the same
 * transaction has already claimed it (a composition bug worth surfacing).
 */
export async function claimIdempotencyKey(
  executor: Executor,
  input: ClaimInput,
): Promise<ClaimResult> {
  const db = executorOf(executor);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const inserted = await db
      .insert(idempotencyRecord)
      .values({
        scope: input.scope,
        key: input.key,
        fingerprint: input.fingerprint,
        state: 'in_progress',
        response: null,
        createdAt: input.now,
        expiresAt: input.expiresAt,
      })
      .onConflictDoNothing({ target: [idempotencyRecord.scope, idempotencyRecord.key] })
      .returning({ key: idempotencyRecord.key });

    if (inserted.length === 1) return { kind: 'claimed' };

    // The row exists. `for update` waits for a concurrent claimer to commit or roll back, then shows
    // us the committed state rather than a snapshot from before it finished.
    const rows = await db
      .select()
      .from(idempotencyRecord)
      .where(and(eq(idempotencyRecord.scope, input.scope), eq(idempotencyRecord.key, input.key)))
      .for('update');

    const record = rows[0];
    if (record === undefined) continue; // The row was purged between the insert and the read.

    if (record.fingerprint !== input.fingerprint) return { kind: 'conflict' };
    if (record.state === 'completed') return { kind: 'replay', response: record.response };
    if (record.expiresAt > input.now) return { kind: 'in_progress' };

    // Past its window: forget the record and try to claim the key again.
    await db
      .delete(idempotencyRecord)
      .where(and(eq(idempotencyRecord.scope, input.scope), eq(idempotencyRecord.key, input.key)));
  }

  return { kind: 'conflict' };
}

/**
 * Stores the original response for a claimed key.
 *
 * Must run in the same transaction as the business change and the claim, so a replay can only see a
 * response for a change that actually committed.
 *
 * @throws when no matching claim exists — a caller completing a key it never claimed has a bug.
 */
export async function completeIdempotencyClaim(
  executor: Executor,
  input: {
    readonly scope: string;
    readonly key: string;
    readonly fingerprint: string;
    readonly response: unknown;
  },
): Promise<void> {
  const db = executorOf(executor);
  const updated = await db
    .update(idempotencyRecord)
    .set({ state: 'completed', response: input.response })
    .where(
      and(
        eq(idempotencyRecord.scope, input.scope),
        eq(idempotencyRecord.key, input.key),
        eq(idempotencyRecord.fingerprint, input.fingerprint),
      ),
    )
    .returning({ key: idempotencyRecord.key });

  if (updated.length === 0) {
    throw new Error(
      `No idempotency claim exists for scope "${input.scope}" with this key and fingerprint; a response cannot be completed for a claim that was never taken.`,
    );
  }
}

/**
 * Removes records whose operational window has passed.
 *
 * @returns How many records were removed. Used by the retention sweep, never by a request path.
 */
export async function purgeExpiredIdempotencyRecords(
  executor: Executor,
  now: string,
): Promise<number> {
  const db = executorOf(executor);
  const removed = await db
    .delete(idempotencyRecord)
    .where(lte(idempotencyRecord.expiresAt, now))
    .returning({ key: idempotencyRecord.key });
  return removed.length;
}
