/**
 * The ward-reference module (`FEAT-002`, `FEAT-001`): the platform's own ward list, the resident's
 * description and its review, and the residence review that moves a member to checked.
 *
 * The module owns the rules that decide which ward a resident's words point at, and what a
 * confirmation or a review does to the member, the submission and the reference. It assigns nothing
 * by itself: every write goes through a port the composition root binds, and a model never decides
 * (`packages/domain/AGENTS.md` Discipline).
 */
export {
  RESIDENCE_REVIEW_DECISIONS,
  RESIDENCE_REVIEW_METHODS,
  WARD_CALLER_ROLES,
  WARD_DESCRIPTION_REVIEW_STATUSES,
  WARD_REVIEW_WORKS,
  WARD_SOURCES,
  WARD_STATUSES,
  wardFailure,
  type IdentityState,
  type LocationScope,
  type PendingWardResidence,
  type QueuedWardDescriptionReview,
  type ResidenceReview,
  type ResidenceReviewDecision,
  type ResidenceReviewMethod,
  type SubmissionStatus,
  type Ward,
  type WardCaller,
  type WardCallerRole,
  type WardCandidate,
  type WardCandidateSource,
  type WardDescriptionReview,
  type WardDescriptionReviewStatus,
  type WardFailure,
  type WardFailureCode,
  type WardFieldReason,
  type WardOption,
  type WardReviewWork,
  type WardSource,
  type WardStatus,
} from './entities.ts';

export {
  RESIDENCE_REVIEW_NOTES_MAX_LENGTH,
  WARD_CANDIDATE_LIMIT,
  WARD_DESCRIPTION_MAX_LENGTH,
  WARD_LOCAL_GOVERNMENT_AREA_MAX_LENGTH,
  WARD_PAGE_DEFAULT_LIMIT,
  WARD_PAGE_MAX_LIMIT,
  WARD_REJECTION_REASON_MAX_LENGTH,
  countsInAnswerRateDenominator,
  countsInWardReporting,
  distinctiveTokens,
  identityStateAfterReview,
  isWardDescriptionReviewStatus,
  isWardReviewer,
  isWardReviewWork,
  matchWardCandidates,
  movesWithWardResolution,
  normaliseWardText,
  readDescription,
  readLocalGovernmentArea,
  readPageLimit,
  readResidenceNotes,
  residenceReviewNeedsRecordedWard,
  scoreWard,
  type FieldReading,
  type WardMatch,
  type WardMatchResult,
} from './policies.ts';

export type {
  ResidenceReviewPort,
  WardAnalyticsEvent,
  WardAnalyticsPort,
  WardBackingPort,
  WardDescriptionReviewPort,
  WardDescriptionReviewQuery,
  WardListQuery,
  WardMemberPort,
  WardMemberState,
  WardPorts,
  WardReferencePort,
  WardResidenceQueueQuery,
  WardSubmissionPort,
  WardSubmissionState,
} from './ports.ts';

export { listWards, type ListWardsInput, type ListWardsResult } from './use-cases/list-wards.ts';
export {
  suggestWardCandidates,
  type SuggestWardCandidatesInput,
  type SuggestWardCandidatesResult,
  type WardCandidateCapabilityStatus,
} from './use-cases/suggest-ward-candidates.ts';
export {
  confirmWard,
  type ConfirmWardInput,
  type ConfirmWardResult,
  type ConfirmedMember,
} from './use-cases/confirm-ward.ts';
export {
  readWardReviewQueue,
  type ReadWardReviewQueueInput,
  type ReadWardReviewQueueResult,
} from './use-cases/read-ward-review-queue.ts';
export {
  resolveWardDescription,
  type ResolveWardDescriptionInput,
  type ResolveWardDescriptionResult,
  type ResolvedMember,
} from './use-cases/resolve-ward-description.ts';
export {
  recordResidenceReview,
  type RecordResidenceReviewInput,
  type RecordResidenceReviewResult,
} from './use-cases/record-residence-review.ts';
