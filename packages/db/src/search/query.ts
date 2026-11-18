/**
 * Full-text query construction (`C-038`, `NFR-009`).
 *
 * User input never becomes SQL syntax. It is passed as a bound parameter to
 * `websearch_to_tsquery('simple', $1)`, which understands quoted phrases and `or` and cannot raise a
 * syntax error on punctuation — a bare `to_tsquery` would refuse half the strings a resident types.
 *
 * `simple` is the configuration the projection was built with; using a different one in the query
 * would silently match nothing, so both sides are defined together here and in `projection.ts`.
 */
import { sql, type SQL } from 'drizzle-orm';

/** The shortest query `C-038` accepts. A one-character query matches almost everything. */
export const MIN_SEARCH_QUERY_LENGTH = 2;

/** Builds the `tsquery` expression for one search string. */
export function buildSearchTsQuery(input: string): SQL {
  return sql`websearch_to_tsquery('simple', ${input})`;
}

/** Ranking expression for the projection's `document` column. */
export function buildRankExpression(input: string): SQL {
  return sql`ts_rank(${sql.identifier('document')}, ${buildSearchTsQuery(input)})`;
}

/** A snippet around the match, for the result list. `body` is the projection's copied text. */
export function buildSnippetExpression(input: string): SQL {
  return sql`ts_headline('simple', ${sql.identifier('body')}, ${buildSearchTsQuery(input)})`;
}
