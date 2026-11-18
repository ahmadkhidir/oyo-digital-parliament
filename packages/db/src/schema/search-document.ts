/**
 * Internal full-text projection — **derived, rebuildable, never a source of truth**.
 *
 * `C-038` searches published submissions only: no draft, no held text and no withdrawn body. The
 * projection is therefore rebuilt from `submission` rows in a published status, and its rows carry
 * nothing the public record does not already show. In particular it carries **no author identifier**,
 * no telephone number and no member name: the projection's join key is the submission, and the author
 * is reached through the record only where a public display name is already allowed.
 *
 * `document` is a generated `tsvector` so the search vector cannot drift from the text it indexes,
 * and a rebuild is `DELETE` plus `INSERT ... SELECT` over the authoritative table. The `simple`
 * configuration is used rather than an English stemmer because the corpus is bilingual (en-NG and
 * yo-NG) and stemming one language's words with the other's rules loses matches.
 */
import { sql } from 'drizzle-orm';
import { check, customType, index, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { pillar, submissionStatus } from './enums.ts';
import { submission } from './submission.ts';
import { ward } from './ward.ts';

/** `tsvector` has no first-class Drizzle column type; this narrow custom type is the whole adapter. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const searchDocument = pgTable(
  'search_document',
  {
    submissionId: text('submission_id')
      .primaryKey()
      .references(() => submission.id),
    reference: varchar('reference', { length: 10 }).notNull(),
    wardId: text('ward_id').references(() => ward.id),
    pillar: pillar('pillar').notNull(),
    status: submissionStatus('status').notNull(),
    /** The published body, copied so a snippet can be produced without re-reading the record. */
    body: varchar('body', { length: 2000 }).notNull(),
    locationText: varchar('location_text', { length: 300 }).notNull(),
    /** Weighted index: reference A, body B, location C. */
    document: tsvector('document').generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce("reference", '')), 'A') || setweight(to_tsvector('simple', coalesce("body", '')), 'B') || setweight(to_tsvector('simple', coalesce("location_text", '')), 'C')`,
    ),
    refreshedAt: utcTimestamp('refreshed_at').notNull(),
  },
  (t) => [
    check('search_document_id_format', isIdentifier(t.submissionId)),
    // Read path: the full-text query itself (`C-038`, NFR-009).
    index('search_document_document_idx').using('gin', t.document),
    // Read path: the ward filter and the degraded fallback to a ward's submissions (`C-038`).
    index('search_document_ward_idx').on(t.wardId),
    // Read path: the pillar filter (`C-038`).
    index('search_document_pillar_idx').on(t.pillar),
    // A projection row is one published submission, never two.
    uniqueIndex('search_document_submission_key').on(t.submissionId),
  ],
);
