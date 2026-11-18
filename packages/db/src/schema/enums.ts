/**
 * The enum catalogue for the whole schema (`schema.md`).
 *
 * Every enum is declared once here and imported by the entity module that uses it. The Postgres type
 * name is the snake-case form of the specification name, so a database inspection reads the same
 * vocabulary as the specification without a lookup table. Members are listed in `schema.md` order;
 * reordering or renaming one is a migration, never an edit in place (`packages/db/AGENTS.md`).
 */
import { pgEnum } from 'drizzle-orm/pg-core';

/** `Ward.source` — how the ward record came to exist. */
export const wardSource = pgEnum('ward_source', ['seeded', 'confirmed', 'reviewed']);

/** `Member.wardStatus`, `Submission.wardStatus`, `SubmissionDraft.wardStatus`. */
export const wardStatus = pgEnum('ward_status', ['resolved', 'unresolved']);

/** `Member.identityState` and `Backing.identityStateAtBacking`. */
export const identityState = pgEnum('identity_state', ['registered', 'checked']);

/** `Member.verificationMethod` — a self-entered code or an organiser's attestation. */
export const verificationMethod = pgEnum('verification_method', [
  'self_code',
  'organiser_attestation',
]);

/** `Member.locale`, `PendingRegistration.locale` — the two launch locales. */
export const locale = pgEnum('locale', ['en-NG', 'yo-NG']);

/** `ResidenceReview.method`. */
export const residenceReviewMethod = pgEnum('residence_review_method', [
  'ward_confirmation',
  'organiser_attestation',
  'document',
]);

/** `ResidenceReview.decision`. */
export const residenceReviewDecision = pgEnum('residence_review_decision', ['checked', 'rejected']);

/** `Consent.purpose` — one optional purpose per record. */
export const consentPurpose = pgEnum('consent_purpose', [
  'decision_notices',
  'record_transfer',
  'assisted_recording',
]);

/** `StaffUser.role`. */
export const staffRole = pgEnum('staff_role', [
  'ward_organiser',
  'response_staff',
  'moderator',
  'external_reviewer',
  'legal_reviewer',
  'operator',
]);

/** `WardDescriptionReview.status`. */
export const wardDescriptionReviewStatus = pgEnum('ward_description_review_status', [
  'queued',
  'resolved',
  'rejected',
]);

/** `Submission.type`, `SubmissionDraft.type` and the decision-draft outcome type. */
export const submissionType = pgEnum('submission_type', ['issue', 'proposal']);

/** The manifesto pillar that doubles as the submission category. */
export const pillar = pgEnum('pillar', [
  'local_government_autonomy',
  'infrastructure',
  'health',
  'education',
  'economy_and_jobs',
  'agriculture_and_minerals',
  'security',
]);

/** `Submission.locationScope`, `SubmissionDraft.locationScope`. */
export const locationScope = pgEnum('location_scope', ['in_state', 'out_of_state']);

/** The required cost band on a proposal, commitment or budget-line candidate. */
export const costBand = pgEnum('cost_band', [
  'under_5m',
  '5m_to_20m',
  '20m_to_100m',
  '100m_to_500m',
  'over_500m',
  'unknown',
]);

/** `Submission.status` — overdue is derived, never a member of this enum. */
export const submissionStatus = pgEnum('submission_status', [
  'awaiting_decision',
  'decided',
  'withdrawn',
  'withheld',
  'out_of_area',
]);

/** `Submission.source`. */
export const submissionSource = pgEnum('submission_source', ['web', 'assisted_intake']);

/** `SubmissionDraft.status`. */
export const submissionDraftStatus = pgEnum('submission_draft_status', [
  'draft',
  'held_for_review',
]);

/** `Backing.state`. */
export const backingState = pgEnum('backing_state', ['active', 'withdrawn', 'voided']);

/** `Comment.status` — removal is a state change, never a delete. */
export const commentStatus = pgEnum('comment_status', [
  'published',
  'removed',
  'held_for_legal',
  'restored',
  'withdrawn',
]);

/** `Comment.routingFlag` — an advisory queue ordering, never published. */
export const routingFlag = pgEnum('routing_flag', [
  'ordinary',
  'abuse_or_threat',
  'named_allegation',
  'spam',
]);

/** `ModerationAction.action`. */
export const moderationActionKind = pgEnum('moderation_action_kind', [
  'remove',
  'restore',
  'hold_for_legal',
  'release_from_legal',
]);

/** `ModerationAction.reviewStatus`. */
export const moderationReviewStatus = pgEnum('moderation_review_status', [
  'not_reviewable',
  'open',
  'upheld',
  'reversed',
  'invalid',
]);

/** `Appeal.status`. */
export const appealStatus = pgEnum('appeal_status', ['open', 'upheld', 'reversed', 'reassigned']);

/** `LegalReview.status`. */
export const legalReviewStatus = pgEnum('legal_review_status', [
  'open',
  'cleared',
  'withheld',
  'takedown',
]);

/** `Decision.type`, `DecisionDraft.type`. */
export const decisionType = pgEnum('decision_type', ['commit', 'decline', 'refer']);

/** `Commitment.status`, `CommitmentStatusChange.fromStatus` and `toStatus`. */
export const commitmentStatus = pgEnum('commitment_status', [
  'committed',
  'delivered',
  'slipped',
  'dropped',
]);

/** `DeliveryEvidence.type`. */
export const deliveryEvidenceType = pgEnum('delivery_evidence_type', [
  'budget_line',
  'site_visit',
  'document',
]);

/** `BudgetLineMatch.status`. */
export const budgetLineMatchStatus = pgEnum('budget_line_match_status', [
  'suggested',
  'confirmed',
  'rejected',
]);

/** `Session.status`. */
export const sessionStatus = pgEnum('session_status', [
  'scheduled',
  'held',
  'cancelled',
  'rescheduled',
]);

/** `Reservation.status`. */
export const reservationStatus = pgEnum('reservation_status', [
  'reserved',
  'waitlisted',
  'cancelled',
]);

/** `SessionQuestion.outcome`. */
export const sessionQuestionOutcome = pgEnum('session_question_outcome', [
  'asked',
  'answered_in_writing',
  'carried_forward',
  'not_reached',
]);

/** `ReportCard.status`. */
export const reportCardStatus = pgEnum('report_card_status', [
  'published',
  'superseded',
  'corrected',
]);

/** `DataRequest.type`. */
export const dataRequestType = pgEnum('data_request_type', [
  'access',
  'correction',
  'export',
  'deletion',
]);

/** `DataRequest.status`. */
export const dataRequestStatus = pgEnum('data_request_status', [
  'received',
  'in_progress',
  'completed',
  'deferred_for_legal_hold',
  'refused',
]);

/** `AuditEvent.actorRole` — the role held at the time; `system` covers a scheduled job. */
export const actorRole = pgEnum('actor_role', [
  'member',
  'ward_organiser',
  'response_staff',
  'moderator',
  'external_reviewer',
  'legal_reviewer',
  'operator',
  'system',
]);

/** `ModelEvaluation.capability` — the four gateway capabilities. */
export const modelCapability = pgEnum('model_capability', [
  'ward_candidate',
  'similar_submission',
  'moderation_routing',
  'budget_line_extraction',
]);
