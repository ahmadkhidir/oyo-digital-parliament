/**
 * The public surface of `@odp/domain`.
 *
 * Phase 0 adds the two event-envelope modules this package starts with: analytics event construction
 * (`C-089`) and the audit record with the `C-077` boundary (`C-090`). Later modules are added here as
 * their issues land, and nothing is reachable from the package root that is not deliberately exported.
 */
export * from './analytics/index.ts';
export * from './audit/index.ts';
export * from './ports/index.ts';
export * from './wards/index.ts';
