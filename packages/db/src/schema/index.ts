/**
 * The schema barrel.
 *
 * `drizzle.config.ts` and the Drizzle client read the schema from here, and nothing outside the
 * package imports an entity module directly. Two modules are infrastructure rather than product
 * entities: `idempotency-record.ts` (ADR-002's durable store) and `search-document.ts` (the derived
 * full-text projection). Every other module mirrors exactly one entity in `schema.md`.
 */
export * from './columns.ts';
export * from './enums.ts';

export * from './ward.ts';
export * from './member.ts';
export * from './pending-registration.ts';
export * from './residence-review.ts';
export * from './consent.ts';
export * from './staff-user.ts';
export * from './ward-description-review.ts';
export * from './submission.ts';
export * from './submission-draft.ts';
export * from './backing.ts';
export * from './comment.ts';
export * from './rule.ts';
export * from './moderation-action.ts';
export * from './appeal.ts';
export * from './legal-review.ts';
export * from './decision.ts';
export * from './decision-draft.ts';
export * from './commitment.ts';
export * from './commitment-status-change.ts';
export * from './delivery-evidence.ts';
export * from './budget-line-match.ts';
export * from './session.ts';
export * from './reservation.ts';
export * from './session-question.ts';
export * from './report-card.ts';
export * from './ward-report-snapshot.ts';
export * from './ward-pillar-snapshot.ts';
export * from './data-request.ts';
export * from './audit-event.ts';
export * from './model-evaluation.ts';

export * from './idempotency-record.ts';
export * from './search-document.ts';
