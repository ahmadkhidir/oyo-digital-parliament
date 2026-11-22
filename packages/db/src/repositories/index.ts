/**
 * The repository export surface (`packages/db/AGENTS.md` Structure).
 *
 * One repository per domain port. Only this barrel is exported from the package root; an entity
 * module is never a repository.
 */
export {
  analyticsRetentionInstant,
  createAnalyticsEventRepository,
  type AnalyticsEventRepository,
} from './analytics-event.repository.ts';
export {
  createAuditEventRepository,
  readAuditEventsForEntity,
  type AuditEventRepository,
} from './audit-event.repository.ts';
export { createConsentRepository, type ConsentRepository } from './consent.repository.ts';
export {
  createDataRequestRepository,
  type DataRequestRepository,
  type DataRequestTransition,
} from './data-request.repository.ts';
export { createMemberRepository, type MemberRepository } from './member.repository.ts';
export {
  createOutboundNotificationRepository,
  type OutboundNotificationRepository,
} from './outbound-notification.repository.ts';
export {
  createPendingRegistrationRepository,
  type PendingRegistrationRepository,
} from './pending-registration.repository.ts';
export { createStaffUserRepository, type StaffUserRepository } from './staff-user.repository.ts';
export {
  createStaffCredentialRepository,
  type StaffCredentialRepository,
  type StaffCredentialSeams,
} from './staff-credential.repository.ts';
export {
  createWardDescriptionReviewRepository,
  type WardDescriptionReviewRepository,
} from './ward-description-review.repository.ts';
export { createWardRepository, type WardRepository } from './ward.repository.ts';
export {
  createWardResidenceReviewRepository,
  type WardResidenceReviewRepository,
} from './ward-residence-review.repository.ts';
export {
  createWardResolutionRepository,
  type WardResolutionRepository,
} from './ward-resolution.repository.ts';
