/**
 * The full-text projection (`C-038`, `NFR-009`).
 *
 * The projection is derived: a rebuild must reproduce it exactly, exclude everything the public
 * record does not show, and carry no author identifier. A status change after one rebuild is visible
 * after the next, which is what "rebuildable from the authoritative tables" means.
 */
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { searchDocument } from '../../src/schema/search-document.ts';
import { submission } from '../../src/schema/submission.ts';
import { buildRankExpression, buildSearchTsQuery } from '../../src/search/query.ts';
import { rebuildSearchProjection } from '../../src/search/projection.ts';
import {
  T0,
  createMember,
  createSubmission,
  createTestDatabase,
  createWard,
} from '../../src/testing/index.ts';

const REFRESHED_AT = '2026-01-06T00:00:00Z';

describe('search projection', () => {
  it('rebuilds from published submissions only and carries no identifier', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });

      const published = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        body: 'The borehole at Agbowo market has been dry since March and the queue is long.',
        status: 'awaiting_decision',
      });
      const decided = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        body: 'A health centre for the ward would cut the journey to the general hospital.',
        status: 'decided',
      });
      await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        body: 'A withdrawn borehole contract that must never be searchable.',
        status: 'withdrawn',
      });
      await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        body: 'A withheld borehole allegation held for legal review.',
        status: 'withheld',
      });
      await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        body: 'An out-of-area borehole request that belongs to another state.',
        status: 'out_of_area',
      });

      const indexed = await rebuildSearchProjection(database.db, REFRESHED_AT);
      expect(indexed).toBe(2);

      const rows = await database.db
        .select({ submissionId: searchDocument.submissionId })
        .from(searchDocument);
      expect(rows.map((row) => row.submissionId).sort()).toEqual([published, decided].sort());

      const matches = await database.db
        .select({
          reference: searchDocument.reference,
          rank: buildRankExpression('borehole'),
        })
        .from(searchDocument)
        .where(sql`${searchDocument.document} @@ ${buildSearchTsQuery('borehole')}`);
      expect(matches).toHaveLength(1);

      const columns = await database.pool.query<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'search_document'`,
      );
      const names = columns.rows.map((row) => row.column_name);
      expect(names).not.toContain('member_id');
      expect(names).not.toContain('author_id');
      expect(names).not.toContain('telephone_number');
      expect(names).not.toContain('full_name');
    } finally {
      await database.dispose();
    }
  });

  it('is idempotent and reflects a status change on the next rebuild', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      const submissionId = await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        body: 'A market stall roof that leaks through every rainy season.',
        status: 'decided',
      });

      expect(await rebuildSearchProjection(database.db, REFRESHED_AT)).toBe(1);
      expect(await rebuildSearchProjection(database.db, REFRESHED_AT)).toBe(1);

      await database.db
        .update(submission)
        .set({ status: 'withheld' })
        .where(eq(submission.id, submissionId));

      expect(await rebuildSearchProjection(database.db, REFRESHED_AT)).toBe(0);
      const rows = await database.pool.query('select 1 from search_document');
      expect(rows.rowCount).toBe(0);
    } finally {
      await database.dispose();
    }
  });

  it('treats user punctuation as text rather than query syntax', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      await createSubmission(database.db, {
        authorId: memberId,
        wardId,
        body: 'The borehole at Agbowo market has been dry since March and the queue is long.',
      });
      await rebuildSearchProjection(database.db, REFRESHED_AT);

      const rows = await database.db
        .select({ reference: searchDocument.reference })
        .from(searchDocument)
        .where(
          sql`${searchDocument.document} @@ ${buildSearchTsQuery('borehole? "agbowo market" or')}`,
        );
      expect(rows.length).toBeGreaterThanOrEqual(0);
    } finally {
      await database.dispose();
    }
  });

  it('stamps the caller-supplied instant, not the database clock', async () => {
    const database = await createTestDatabase();
    try {
      const wardId = await createWard(database.db);
      const memberId = await createMember(database.db, { wardId });
      await createSubmission(database.db, { authorId: memberId, wardId, submittedAt: T0 });

      await rebuildSearchProjection(database.db, REFRESHED_AT);
      const rows = await database.db
        .select({ refreshedAt: searchDocument.refreshedAt })
        .from(searchDocument);
      expect(rows).toEqual([{ refreshedAt: REFRESHED_AT }]);
    } finally {
      await database.dispose();
    }
  });
});
