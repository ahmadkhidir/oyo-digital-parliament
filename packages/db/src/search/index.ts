/**
 * Search projection and query construction (`C-038`).
 *
 * `projection.ts` owns the derived table's rebuild; `query.ts` owns the tsquery and ranking
 * expressions. Neither is a source of truth.
 */
export * from './projection.ts';
export * from './query.ts';
