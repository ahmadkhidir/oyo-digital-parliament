/**
 * The full-text projection (`C-038`, `NFR-009`).
 *
 * The projection is derived state: `search_document` is rebuilt from `submission` and never written
 * by a request path as the source of truth. A rebuild is atomic and idempotent — clearing and
 * refilling in one transaction — so a reader never sees a half-built index and running it twice
 * produces the same rows.
 *
 * Only published submissions enter the projection: `awaiting_decision` and `decided`. A withdrawn,
 * withheld or out-of-area submission is absent, so its text cannot be surfaced by a search that
 * `C-038` promises returns no held or withdrawn body.
 */
import { sql } from 'drizzle-orm';
import { isTransactionScope, withTransaction, type Executor, executorOf } from '../client.ts';
import { searchDocument } from '../schema/search-document.ts';
import { submission } from '../schema/submission.ts';

/** Statuses whose submission text is public and searchable. */
const SEARCHABLE_SUBMISSION_STATUSES = ['awaiting_decision', 'decided'] as const;

/**
 * Rebuilds the whole projection from the authoritative tables.
 *
 * @param executor - The client or an open transaction.
 * @param refreshedAt - The instant stamped on every rebuilt row, supplied by the caller's clock.
 * @returns How many published submissions were indexed.
 */
export async function rebuildSearchProjection(
  executor: Executor,
  refreshedAt: string,
): Promise<number> {
  if (isTransactionScope(executor)) return rebuild(executor, refreshedAt);
  return withTransaction((scope) => rebuild(scope, refreshedAt), executor);
}

async function rebuild(executor: Executor, refreshedAt: string): Promise<number> {
  const db = executorOf(executor);
  await db.execute(sql`delete from ${searchDocument}`);

  const statuses = sql.join(
    SEARCHABLE_SUBMISSION_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  );
  const result = await db.execute(sql`
    insert into ${searchDocument}
      (submission_id, reference, ward_id, pillar, status, body, location_text, refreshed_at)
    select id, reference, ward_id, pillar, status, body, location_text, ${refreshedAt}::timestamptz
    from ${submission}
    where status in (${statuses})
    returning submission_id
  `);

  return result.rows.length;
}
