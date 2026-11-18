/**
 * The repository export surface (`packages/db/AGENTS.md` Structure).
 *
 * One repository per domain port. Only this barrel is exported from the package root; an entity
 * module is never a repository.
 */
export {
  createAuditEventRepository,
  readAuditEventsForEntity,
  type AuditEventRepository,
} from './audit-event.repository.ts';
export {
  createWardDescriptionReviewRepository,
  type WardDescriptionReviewRepository,
} from './ward-description-review.repository.ts';
export {
  createWardRepository,
  type WardRepository,
} from './ward.repository.ts';
export {
  createWardResidenceReviewRepository,
  type WardResidenceReviewRepository,
} from './ward-residence-review.repository.ts';
export {
  createWardResolutionRepository,
  type WardResolutionRepository,
} from './ward-resolution.repository.ts';
