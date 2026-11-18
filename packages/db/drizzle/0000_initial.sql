CREATE TYPE "public"."actor_role" AS ENUM('member', 'ward_organiser', 'response_staff', 'moderator', 'external_reviewer', 'legal_reviewer', 'operator', 'system');--> statement-breakpoint
CREATE TYPE "public"."appeal_status" AS ENUM('open', 'upheld', 'reversed', 'reassigned');--> statement-breakpoint
CREATE TYPE "public"."backing_state" AS ENUM('active', 'withdrawn', 'voided');--> statement-breakpoint
CREATE TYPE "public"."budget_line_match_status" AS ENUM('suggested', 'confirmed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."comment_status" AS ENUM('published', 'removed', 'held_for_legal', 'restored', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."commitment_status" AS ENUM('committed', 'delivered', 'slipped', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('decision_notices', 'record_transfer', 'assisted_recording');--> statement-breakpoint
CREATE TYPE "public"."cost_band" AS ENUM('under_5m', '5m_to_20m', '20m_to_100m', '100m_to_500m', 'over_500m', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."data_request_status" AS ENUM('received', 'in_progress', 'completed', 'deferred_for_legal_hold', 'refused');--> statement-breakpoint
CREATE TYPE "public"."data_request_type" AS ENUM('access', 'correction', 'export', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."decision_type" AS ENUM('commit', 'decline', 'refer');--> statement-breakpoint
CREATE TYPE "public"."delivery_evidence_type" AS ENUM('budget_line', 'site_visit', 'document');--> statement-breakpoint
CREATE TYPE "public"."identity_state" AS ENUM('registered', 'checked');--> statement-breakpoint
CREATE TYPE "public"."legal_review_status" AS ENUM('open', 'cleared', 'withheld', 'takedown');--> statement-breakpoint
CREATE TYPE "public"."locale" AS ENUM('en-NG', 'yo-NG');--> statement-breakpoint
CREATE TYPE "public"."location_scope" AS ENUM('in_state', 'out_of_state');--> statement-breakpoint
CREATE TYPE "public"."model_capability" AS ENUM('ward_candidate', 'similar_submission', 'moderation_routing', 'budget_line_extraction');--> statement-breakpoint
CREATE TYPE "public"."moderation_action_kind" AS ENUM('remove', 'restore', 'hold_for_legal', 'release_from_legal');--> statement-breakpoint
CREATE TYPE "public"."moderation_review_status" AS ENUM('not_reviewable', 'open', 'upheld', 'reversed', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."pillar" AS ENUM('local_government_autonomy', 'infrastructure', 'health', 'education', 'economy_and_jobs', 'agriculture_and_minerals', 'security');--> statement-breakpoint
CREATE TYPE "public"."report_card_status" AS ENUM('published', 'superseded', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('reserved', 'waitlisted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."residence_review_decision" AS ENUM('checked', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."residence_review_method" AS ENUM('ward_confirmation', 'organiser_attestation', 'document');--> statement-breakpoint
CREATE TYPE "public"."routing_flag" AS ENUM('ordinary', 'abuse_or_threat', 'named_allegation', 'spam');--> statement-breakpoint
CREATE TYPE "public"."session_question_outcome" AS ENUM('asked', 'answered_in_writing', 'carried_forward', 'not_reached');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('scheduled', 'held', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('ward_organiser', 'response_staff', 'moderator', 'external_reviewer', 'legal_reviewer', 'operator');--> statement-breakpoint
CREATE TYPE "public"."submission_draft_status" AS ENUM('draft', 'held_for_review');--> statement-breakpoint
CREATE TYPE "public"."submission_source" AS ENUM('web', 'assisted_intake');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('awaiting_decision', 'decided', 'withdrawn', 'withheld', 'out_of_area');--> statement-breakpoint
CREATE TYPE "public"."submission_type" AS ENUM('issue', 'proposal');--> statement-breakpoint
CREATE TYPE "public"."verification_method" AS ENUM('self_code', 'organiser_attestation');--> statement-breakpoint
CREATE TYPE "public"."ward_description_review_status" AS ENUM('queued', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ward_source" AS ENUM('seeded', 'confirmed', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."ward_status" AS ENUM('resolved', 'unresolved');--> statement-breakpoint
CREATE TABLE "ward" (
	"id" text PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"local_government_area" varchar(120) NOT NULL,
	"aliases" text[],
	"source" "ward_source" NOT NULL,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "ward_id_format" CHECK ("ward"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"telephone_number" varchar(20) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"declared_age" smallint NOT NULL,
	"ward_id" text,
	"ward_status" "ward_status" NOT NULL,
	"identity_state" "identity_state" NOT NULL,
	"verification_method" "verification_method" NOT NULL,
	"shared_number" boolean NOT NULL,
	"attested_by_id" text,
	"attested_at" timestamp(0) with time zone,
	"locale" "locale" NOT NULL,
	"created_at" timestamp(0) with time zone NOT NULL,
	"deleted_at" timestamp(0) with time zone,
	CONSTRAINT "member_id_format" CHECK ("member"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "member_telephone_format" CHECK ("member"."telephone_number" ~ '^\+234[0-9]{10}$'),
	CONSTRAINT "member_age_band" CHECK ("member"."declared_age" between 18 and 35),
	CONSTRAINT "member_ward_resolution" CHECK ("member"."ward_status" <> 'resolved' or "member"."ward_id" is not null),
	CONSTRAINT "member_attestation_complete" CHECK ("member"."verification_method" <> 'organiser_attestation' or ("member"."attested_by_id" is not null and "member"."attested_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "pending_registration" (
	"id" text PRIMARY KEY NOT NULL,
	"telephone_number" varchar(20) NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"display_name" varchar(60) NOT NULL,
	"declared_age" smallint NOT NULL,
	"locale" "locale" NOT NULL,
	"code_sent_at" timestamp(0) with time zone,
	"expires_at" timestamp(0) with time zone NOT NULL,
	"verified_at" timestamp(0) with time zone,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "pending_registration_id_format" CHECK ("pending_registration"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "pending_registration_telephone_format" CHECK ("pending_registration"."telephone_number" ~ '^\+234[0-9]{10}$'),
	CONSTRAINT "pending_registration_age_band" CHECK ("pending_registration"."declared_age" between 18 and 35)
);
--> statement-breakpoint
CREATE TABLE "residence_review" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"method" "residence_review_method" NOT NULL,
	"notes" varchar(1000),
	"decision" "residence_review_decision" NOT NULL,
	"reviewed_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "residence_review_id_format" CHECK ("residence_review"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "consent" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"granted" boolean NOT NULL,
	"recorded_at" timestamp(0) with time zone NOT NULL,
	"withdrawn_at" timestamp(0) with time zone,
	CONSTRAINT "consent_id_format" CHECK ("consent"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "consent_withdrawal_state" CHECK ("consent"."granted" = false or "consent"."withdrawn_at" is null)
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"role" "staff_role" NOT NULL,
	"external" boolean NOT NULL,
	"authorised_ward_ids" text[],
	"second_factor_enrolled" boolean NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "staff_user_id_format" CHECK ("staff_user"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "staff_user_external_reviewer_outside" CHECK ("staff_user"."role" <> 'external_reviewer' or "staff_user"."external" = true)
);
--> statement-breakpoint
CREATE TABLE "ward_description_review" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"submission_id" text,
	"description" varchar(500) NOT NULL,
	"local_government_area" varchar(120),
	"status" "ward_description_review_status" NOT NULL,
	"resolved_ward_id" text,
	"rejection_reason" varchar(500),
	"reviewer_id" text,
	"created_at" timestamp(0) with time zone NOT NULL,
	"resolved_at" timestamp(0) with time zone,
	CONSTRAINT "ward_description_review_id_format" CHECK ("ward_description_review"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "ward_description_review_resolution" CHECK ("ward_description_review"."status" <> 'resolved' or "ward_description_review"."resolved_ward_id" is not null),
	CONSTRAINT "ward_description_review_rejection" CHECK ("ward_description_review"."status" <> 'rejected' or "ward_description_review"."rejection_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" text PRIMARY KEY NOT NULL,
	"reference" varchar(10) NOT NULL,
	"author_id" text NOT NULL,
	"recorder_id" text,
	"ward_id" text,
	"ward_status" "ward_status" NOT NULL,
	"type" "submission_type" NOT NULL,
	"body" varchar(2000) NOT NULL,
	"pillar" "pillar" NOT NULL,
	"location_text" varchar(300) NOT NULL,
	"location_scope" "location_scope" NOT NULL,
	"cost_band" "cost_band",
	"responsible_authority" varchar(200),
	"status" "submission_status" NOT NULL,
	"contains_named_entity" boolean NOT NULL,
	"source" "submission_source" NOT NULL,
	"submitted_at" timestamp(0) with time zone NOT NULL,
	"withdrawn_at" timestamp(0) with time zone,
	CONSTRAINT "submission_id_format" CHECK ("submission"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "submission_reference_format" CHECK ("submission"."reference" ~ '^ODP-[0-9]{6}$'),
	CONSTRAINT "submission_body_length" CHECK (char_length("submission"."body") >= 30),
	CONSTRAINT "submission_ward_resolution" CHECK ("submission"."ward_status" <> 'resolved' or "submission"."ward_id" is not null),
	CONSTRAINT "submission_proposal_fields" CHECK ("submission"."type" <> 'proposal' or ("submission"."cost_band" is not null and "submission"."responsible_authority" is not null)),
	CONSTRAINT "submission_withdrawal_time" CHECK ("submission"."status" <> 'withdrawn' or "submission"."withdrawn_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "submission_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"recorder_id" text,
	"ward_id" text,
	"ward_status" "ward_status" NOT NULL,
	"type" "submission_type",
	"body" varchar(2000),
	"pillar" "pillar",
	"location_text" varchar(300),
	"location_scope" "location_scope",
	"cost_band" "cost_band",
	"responsible_authority" varchar(200),
	"contains_named_entity" boolean,
	"status" "submission_draft_status" NOT NULL,
	"held_reason" varchar(500),
	"created_at" timestamp(0) with time zone NOT NULL,
	"updated_at" timestamp(0) with time zone NOT NULL,
	"expires_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "submission_draft_id_format" CHECK ("submission_draft"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "submission_draft_ward_resolution" CHECK ("submission_draft"."ward_status" <> 'resolved' or "submission_draft"."ward_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "backing" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"member_id" text NOT NULL,
	"identity_state_at_backing" "identity_state" NOT NULL,
	"ward_id_at_backing" text NOT NULL,
	"state" "backing_state" NOT NULL,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "backing_id_format" CHECK ("backing"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "comment" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"author_id" text NOT NULL,
	"body" varchar(2000) NOT NULL,
	"status" "comment_status" NOT NULL,
	"routing_flag" "routing_flag",
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "comment_id_format" CHECK ("comment"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "comment_body_length" CHECK (char_length("comment"."body") >= 1)
);
--> statement-breakpoint
CREATE TABLE "rule" (
	"id" text PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"title" varchar(120) NOT NULL,
	"text" varchar(2000) NOT NULL,
	"active" boolean NOT NULL,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "rule_id_format" CHECK ("rule"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "moderation_action" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"moderator_id" text NOT NULL,
	"action" "moderation_action_kind" NOT NULL,
	"rule_id" text,
	"reason" varchar(1000) NOT NULL,
	"review_status" "moderation_review_status" NOT NULL,
	"assigned_reviewer_id" text,
	"reviewer_id" text,
	"review_reason" varchar(1000),
	"reviewed_at" timestamp(0) with time zone,
	"occurred_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "moderation_action_id_format" CHECK ("moderation_action"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "moderation_action_rule_required" CHECK ("moderation_action"."action" <> 'remove' or "moderation_action"."rule_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "appeal" (
	"id" text PRIMARY KEY NOT NULL,
	"comment_id" text NOT NULL,
	"member_id" text NOT NULL,
	"reason" varchar(1500) NOT NULL,
	"status" "appeal_status" NOT NULL,
	"assigned_reviewer_id" text,
	"reviewer_id" text,
	"outcome_reason" varchar(1000),
	"created_at" timestamp(0) with time zone NOT NULL,
	"decided_at" timestamp(0) with time zone,
	CONSTRAINT "appeal_id_format" CHECK ("appeal"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "legal_review" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text,
	"comment_id" text,
	"requested_by_id" text NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"status" "legal_review_status" NOT NULL,
	"reviewer_id" text,
	"outcome_reason" varchar(2000),
	"public_note" varchar(500),
	"requested_at" timestamp(0) with time zone NOT NULL,
	"decided_at" timestamp(0) with time zone,
	CONSTRAINT "legal_review_id_format" CHECK ("legal_review"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "legal_review_requester_format" CHECK ("legal_review"."requested_by_id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "legal_review_single_target" CHECK (num_nonnulls("legal_review"."submission_id", "legal_review"."comment_id") = 1),
	CONSTRAINT "legal_review_public_note_required" CHECK ("legal_review"."status" not in ('withheld', 'takedown') or "legal_review"."public_note" is not null)
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"version" integer NOT NULL,
	"type" "decision_type" NOT NULL,
	"reason" varchar(2000) NOT NULL,
	"authority" varchar(200),
	"signatory_id" text NOT NULL,
	"supersedes_decision_id" text,
	"published_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "decision_id_format" CHECK ("decision"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "decision_version_min" CHECK ("decision"."version" >= 1),
	CONSTRAINT "decision_refer_authority" CHECK ("decision"."type" <> 'refer' or "decision"."authority" is not null)
);
--> statement-breakpoint
CREATE TABLE "decision_draft" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"staff_id" text NOT NULL,
	"type" "decision_type" NOT NULL,
	"reason" varchar(2000),
	"authority" varchar(200),
	"owner" varchar(160),
	"cost_band" "cost_band",
	"target_date" date,
	"pillar" "pillar",
	"reserved_until" timestamp(0) with time zone NOT NULL,
	"created_at" timestamp(0) with time zone NOT NULL,
	"updated_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "decision_draft_id_format" CHECK ("decision_draft"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "commitment" (
	"id" text PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"ward_id" text NOT NULL,
	"owner" varchar(160) NOT NULL,
	"cost_band" "cost_band" NOT NULL,
	"target_date" date NOT NULL,
	"status" "commitment_status" NOT NULL,
	"status_reason" varchar(1000),
	"budget_line_reference" varchar(120),
	"budget_line_description" varchar(500),
	"budget_line_amount" integer,
	"budget_line_confirmed_by_id" text,
	"budget_line_confirmed_at" timestamp(0) with time zone,
	"withdrawn_by_author" boolean NOT NULL,
	"author_withdrawn_at" timestamp(0) with time zone,
	"pillar" "pillar" NOT NULL,
	"updated_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "commitment_id_format" CHECK ("commitment"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "commitment_amount_non_negative" CHECK ("commitment"."budget_line_amount" is null or "commitment"."budget_line_amount" >= 0),
	CONSTRAINT "commitment_status_reason" CHECK ("commitment"."status" not in ('slipped', 'dropped') or "commitment"."status_reason" is not null),
	CONSTRAINT "commitment_budget_confirmation_pair" CHECK (("commitment"."budget_line_confirmed_by_id" is null) = ("commitment"."budget_line_confirmed_at" is null)),
	CONSTRAINT "commitment_author_withdrawal_time" CHECK ("commitment"."withdrawn_by_author" = false or "commitment"."author_withdrawn_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "commitment_status_change" (
	"id" text PRIMARY KEY NOT NULL,
	"commitment_id" text NOT NULL,
	"from_status" "commitment_status" NOT NULL,
	"to_status" "commitment_status" NOT NULL,
	"reason" varchar(1000) NOT NULL,
	"changed_by_id" text NOT NULL,
	"changed_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "commitment_status_change_id_format" CHECK ("commitment_status_change"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "delivery_evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"commitment_id" text NOT NULL,
	"type" "delivery_evidence_type" NOT NULL,
	"reference" varchar(200) NOT NULL,
	"description" varchar(1000) NOT NULL,
	"recorded_by_id" text NOT NULL,
	"recorded_at" timestamp(0) with time zone NOT NULL,
	"public" boolean NOT NULL,
	CONSTRAINT "delivery_evidence_id_format" CHECK ("delivery_evidence"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
CREATE TABLE "budget_line_match" (
	"id" text PRIMARY KEY NOT NULL,
	"commitment_id" text NOT NULL,
	"line_reference" varchar(120) NOT NULL,
	"line_description" varchar(500) NOT NULL,
	"amount" integer NOT NULL,
	"confidence" double precision,
	"status" "budget_line_match_status" NOT NULL,
	"confirmed_by_id" text,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "budget_line_match_id_format" CHECK ("budget_line_match"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "budget_line_match_amount" CHECK ("budget_line_match"."amount" >= 0),
	CONSTRAINT "budget_line_match_confidence_range" CHECK ("budget_line_match"."confidence" is null or ("budget_line_match"."confidence" >= 0 and "budget_line_match"."confidence" <= 1)),
	CONSTRAINT "budget_line_match_confirmation" CHECK ("budget_line_match"."status" = 'suggested' or "budget_line_match"."confirmed_by_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"title" varchar(160) NOT NULL,
	"local_government_area" varchar(120) NOT NULL,
	"venue" varchar(200) NOT NULL,
	"starts_at" timestamp(0) with time zone NOT NULL,
	"capacity" integer NOT NULL,
	"status" "session_status" NOT NULL,
	"cancellation_reason" varchar(500),
	"rescheduled_from_id" text,
	"record_published_at" timestamp(0) with time zone,
	CONSTRAINT "session_id_format" CHECK ("session"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "session_capacity_min" CHECK ("session"."capacity" >= 1),
	CONSTRAINT "session_cancellation_reason" CHECK ("session"."status" <> 'cancelled' or "session"."cancellation_reason" is not null),
	CONSTRAINT "session_reschedule_source" CHECK ("session"."status" <> 'rescheduled' or "session"."rescheduled_from_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "reservation" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"member_id" text NOT NULL,
	"status" "reservation_status" NOT NULL,
	"waitlist_position" integer,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "reservation_id_format" CHECK ("reservation"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "reservation_waitlist_position" CHECK ("reservation"."status" <> 'waitlisted' or ("reservation"."waitlist_position" is not null and "reservation"."waitlist_position" >= 1))
);
--> statement-breakpoint
CREATE TABLE "session_question" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"member_id" text NOT NULL,
	"question_text" varchar(1000) NOT NULL,
	"selected" boolean NOT NULL,
	"selected_by_id" text,
	"selected_at" timestamp(0) with time zone,
	"outcome" "session_question_outcome" NOT NULL,
	"answer_text" varchar(2000),
	"answered_by_id" text,
	"answered_at" timestamp(0) with time zone,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "session_question_id_format" CHECK ("session_question"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "session_question_selection_complete" CHECK ("session_question"."selected" = false or ("session_question"."selected_by_id" is not null and "session_question"."selected_at" is not null)),
	CONSTRAINT "session_question_written_answer" CHECK ("session_question"."outcome" <> 'answered_in_writing' or ("session_question"."answer_text" is not null and "session_question"."answered_by_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "report_card" (
	"id" text PRIMARY KEY NOT NULL,
	"quarter" varchar(7) NOT NULL,
	"cut_off_at" timestamp(0) with time zone NOT NULL,
	"published_at" timestamp(0) with time zone,
	"status" "report_card_status" NOT NULL,
	"correction_of_id" text,
	"answer_rate" double precision NOT NULL,
	"delivery_rate" double precision NOT NULL,
	"committed_count" integer NOT NULL,
	"delivered_count" integer NOT NULL,
	"slipped_count" integer NOT NULL,
	"dropped_count" integer NOT NULL,
	"summary_note" varchar(2000),
	"generated_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "report_card_id_format" CHECK ("report_card"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "report_card_quarter_format" CHECK ("report_card"."quarter" ~ '^[0-9]{4}-Q[1-4]$'),
	CONSTRAINT "report_card_answer_rate_range" CHECK ("report_card"."answer_rate" between 0 and 1),
	CONSTRAINT "report_card_delivery_rate_range" CHECK ("report_card"."delivery_rate" between 0 and 1),
	CONSTRAINT "report_card_committed_count" CHECK ("report_card"."committed_count" >= 0),
	CONSTRAINT "report_card_delivered_count" CHECK ("report_card"."delivered_count" >= 0),
	CONSTRAINT "report_card_slipped_count" CHECK ("report_card"."slipped_count" >= 0),
	CONSTRAINT "report_card_dropped_count" CHECK ("report_card"."dropped_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ward_report_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"report_card_id" text NOT NULL,
	"ward_id" text NOT NULL,
	"quarter" varchar(7) NOT NULL,
	"submissions" integer NOT NULL,
	"decisions" integer NOT NULL,
	"commitments" integer NOT NULL,
	"overdue" integer NOT NULL,
	"suppression_applied" boolean NOT NULL,
	"generated_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "ward_report_snapshot_id_format" CHECK ("ward_report_snapshot"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "ward_report_snapshot_quarter_format" CHECK ("ward_report_snapshot"."quarter" ~ '^[0-9]{4}-Q[1-4]$'),
	CONSTRAINT "ward_report_snapshot_submissions" CHECK ("ward_report_snapshot"."submissions" >= 0),
	CONSTRAINT "ward_report_snapshot_decisions" CHECK ("ward_report_snapshot"."decisions" >= 0),
	CONSTRAINT "ward_report_snapshot_commitments" CHECK ("ward_report_snapshot"."commitments" >= 0),
	CONSTRAINT "ward_report_snapshot_overdue" CHECK ("ward_report_snapshot"."overdue" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ward_pillar_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"report_card_id" text NOT NULL,
	"ward_id" text NOT NULL,
	"quarter" varchar(7) NOT NULL,
	"pillar" "pillar" NOT NULL,
	"submissions" integer NOT NULL,
	"decisions" integer NOT NULL,
	"commitments" integer NOT NULL,
	"overdue" integer NOT NULL,
	"suppression_applied" boolean NOT NULL,
	"generated_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "ward_pillar_snapshot_id_format" CHECK ("ward_pillar_snapshot"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "ward_pillar_snapshot_quarter_format" CHECK ("ward_pillar_snapshot"."quarter" ~ '^[0-9]{4}-Q[1-4]$'),
	CONSTRAINT "ward_pillar_snapshot_submissions" CHECK ("ward_pillar_snapshot"."submissions" >= 0),
	CONSTRAINT "ward_pillar_snapshot_decisions" CHECK ("ward_pillar_snapshot"."decisions" >= 0),
	CONSTRAINT "ward_pillar_snapshot_commitments" CHECK ("ward_pillar_snapshot"."commitments" >= 0),
	CONSTRAINT "ward_pillar_snapshot_overdue" CHECK ("ward_pillar_snapshot"."overdue" >= 0)
);
--> statement-breakpoint
CREATE TABLE "data_request" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"type" "data_request_type" NOT NULL,
	"status" "data_request_status" NOT NULL,
	"legal_hold_note" varchar(500),
	"outcome_reason" varchar(1000),
	"file_reference" varchar(200),
	"completed_by_id" text,
	"requested_at" timestamp(0) with time zone NOT NULL,
	"completed_at" timestamp(0) with time zone,
	CONSTRAINT "data_request_id_format" CHECK ("data_request"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "data_request_completion_time" CHECK ("data_request"."status" <> 'completed' or "data_request"."completed_at" is not null),
	CONSTRAINT "data_request_legal_hold_note" CHECK ("data_request"."status" <> 'deferred_for_legal_hold' or "data_request"."legal_hold_note" is not null),
	CONSTRAINT "data_request_refusal_reason" CHECK ("data_request"."status" <> 'refused' or "data_request"."outcome_reason" is not null)
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" "actor_role" NOT NULL,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" text NOT NULL,
	"reason" varchar(1000),
	"occurred_at" timestamp(0) with time zone NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "audit_event_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"correlation_id" text,
	CONSTRAINT "audit_event_sequence_key" UNIQUE("sequence"),
	CONSTRAINT "audit_event_id_format" CHECK ("audit_event"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "audit_event_actor_id_format" CHECK ("audit_event"."actor_id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "audit_event_entity_id_format" CHECK ("audit_event"."entity_id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "audit_event_action_format" CHECK ("audit_event"."action" ~ '^[a-z][a-z_]*\.[a-z][a-z_]*$'),
	CONSTRAINT "audit_event_correlation_format" CHECK ("audit_event"."correlation_id" is null or "audit_event"."correlation_id" ~ '^req_[0-9A-Z]{4,32}$')
);
--> statement-breakpoint
CREATE TABLE "model_evaluation" (
	"id" text PRIMARY KEY NOT NULL,
	"capability" "model_capability" NOT NULL,
	"model_version" varchar(120) NOT NULL,
	"dataset_size" integer NOT NULL,
	"metric" varchar(80) NOT NULL,
	"threshold" double precision NOT NULL,
	"result" double precision NOT NULL,
	"passed" boolean NOT NULL,
	"run_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "model_evaluation_id_format" CHECK ("model_evaluation"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "model_evaluation_dataset_size" CHECK ("model_evaluation"."dataset_size" >= 1)
);
--> statement-breakpoint
CREATE TABLE "idempotency_record" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"state" text NOT NULL,
	"response" jsonb,
	"created_at" timestamp(0) with time zone NOT NULL,
	"expires_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "idempotency_state_domain" CHECK ("idempotency_record"."state" in ('in_progress', 'completed'))
);
--> statement-breakpoint
CREATE TABLE "search_document" (
	"submission_id" text PRIMARY KEY NOT NULL,
	"reference" varchar(10) NOT NULL,
	"ward_id" text,
	"pillar" "pillar" NOT NULL,
	"status" "submission_status" NOT NULL,
	"body" varchar(2000) NOT NULL,
	"location_text" varchar(300) NOT NULL,
	"document" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce("reference", '')), 'A') || setweight(to_tsvector('simple', coalesce("body", '')), 'B') || setweight(to_tsvector('simple', coalesce("location_text", '')), 'C')) STORED,
	"refreshed_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "search_document_id_format" CHECK ("search_document"."submission_id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$')
);
--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_attested_by_id_staff_user_id_fk" FOREIGN KEY ("attested_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residence_review" ADD CONSTRAINT "residence_review_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "residence_review" ADD CONSTRAINT "residence_review_reviewer_id_staff_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent" ADD CONSTRAINT "consent_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_description_review" ADD CONSTRAINT "ward_description_review_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_description_review" ADD CONSTRAINT "ward_description_review_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_description_review" ADD CONSTRAINT "ward_description_review_resolved_ward_id_ward_id_fk" FOREIGN KEY ("resolved_ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_description_review" ADD CONSTRAINT "ward_description_review_reviewer_id_staff_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_author_id_member_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_recorder_id_staff_user_id_fk" FOREIGN KEY ("recorder_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_draft" ADD CONSTRAINT "submission_draft_author_id_member_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_draft" ADD CONSTRAINT "submission_draft_recorder_id_staff_user_id_fk" FOREIGN KEY ("recorder_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_draft" ADD CONSTRAINT "submission_draft_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backing" ADD CONSTRAINT "backing_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backing" ADD CONSTRAINT "backing_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backing" ADD CONSTRAINT "backing_ward_id_at_backing_ward_id_fk" FOREIGN KEY ("ward_id_at_backing") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_author_id_member_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_moderator_id_staff_user_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_rule_id_rule_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."rule"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_assigned_reviewer_id_staff_user_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_action" ADD CONSTRAINT "moderation_action_reviewer_id_staff_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_assigned_reviewer_id_staff_user_id_fk" FOREIGN KEY ("assigned_reviewer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appeal" ADD CONSTRAINT "appeal_reviewer_id_staff_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_review" ADD CONSTRAINT "legal_review_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_review" ADD CONSTRAINT "legal_review_comment_id_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_review" ADD CONSTRAINT "legal_review_reviewer_id_staff_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_signatory_id_staff_user_id_fk" FOREIGN KEY ("signatory_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_supersedes_decision_id_decision_id_fk" FOREIGN KEY ("supersedes_decision_id") REFERENCES "public"."decision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_draft" ADD CONSTRAINT "decision_draft_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_draft" ADD CONSTRAINT "decision_draft_staff_id_staff_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_decision_id_decision_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."decision"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_budget_line_confirmed_by_id_staff_user_id_fk" FOREIGN KEY ("budget_line_confirmed_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_status_change" ADD CONSTRAINT "commitment_status_change_commitment_id_commitment_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitment_status_change" ADD CONSTRAINT "commitment_status_change_changed_by_id_staff_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_evidence" ADD CONSTRAINT "delivery_evidence_commitment_id_commitment_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_evidence" ADD CONSTRAINT "delivery_evidence_recorded_by_id_staff_user_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_match" ADD CONSTRAINT "budget_line_match_commitment_id_commitment_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."commitment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_match" ADD CONSTRAINT "budget_line_match_confirmed_by_id_staff_user_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_rescheduled_from_id_session_id_fk" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_selected_by_id_staff_user_id_fk" FOREIGN KEY ("selected_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_question" ADD CONSTRAINT "session_question_answered_by_id_staff_user_id_fk" FOREIGN KEY ("answered_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_card" ADD CONSTRAINT "report_card_correction_of_id_report_card_id_fk" FOREIGN KEY ("correction_of_id") REFERENCES "public"."report_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_report_snapshot" ADD CONSTRAINT "ward_report_snapshot_report_card_id_report_card_id_fk" FOREIGN KEY ("report_card_id") REFERENCES "public"."report_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_report_snapshot" ADD CONSTRAINT "ward_report_snapshot_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_pillar_snapshot" ADD CONSTRAINT "ward_pillar_snapshot_report_card_id_report_card_id_fk" FOREIGN KEY ("report_card_id") REFERENCES "public"."report_card"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ward_pillar_snapshot" ADD CONSTRAINT "ward_pillar_snapshot_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_request" ADD CONSTRAINT "data_request_completed_by_id_staff_user_id_fk" FOREIGN KEY ("completed_by_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_document" ADD CONSTRAINT "search_document_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_document" ADD CONSTRAINT "search_document_ward_id_ward_id_fk" FOREIGN KEY ("ward_id") REFERENCES "public"."ward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ward_name_lga_key" ON "ward" USING btree ("name","local_government_area");--> statement-breakpoint
CREATE INDEX "ward_lga_idx" ON "ward" USING btree ("local_government_area");--> statement-breakpoint
CREATE INDEX "member_telephone_idx" ON "member" USING btree ("telephone_number");--> statement-breakpoint
CREATE INDEX "pending_registration_expires_idx" ON "pending_registration" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "pending_registration_telephone_idx" ON "pending_registration" USING btree ("telephone_number");--> statement-breakpoint
CREATE INDEX "residence_review_member_idx" ON "residence_review" USING btree ("member_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "consent_member_purpose_key" ON "consent" USING btree ("member_id","purpose");--> statement-breakpoint
CREATE INDEX "ward_description_review_queue_idx" ON "ward_description_review" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ward_description_review_member_idx" ON "ward_description_review" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_reference_key" ON "submission" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "submission_ward_idx" ON "submission" USING btree ("ward_id","submitted_at");--> statement-breakpoint
CREATE INDEX "submission_queue_idx" ON "submission" USING btree ("submitted_at") WHERE "submission"."status" = 'awaiting_decision' and "submission"."location_scope" = 'in_state';--> statement-breakpoint
CREATE INDEX "submission_author_idx" ON "submission" USING btree ("author_id","submitted_at");--> statement-breakpoint
CREATE INDEX "submission_pillar_idx" ON "submission" USING btree ("pillar");--> statement-breakpoint
CREATE INDEX "submission_draft_expires_idx" ON "submission_draft" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "submission_draft_author_idx" ON "submission_draft" USING btree ("author_id","updated_at");--> statement-breakpoint
CREATE INDEX "submission_draft_status_idx" ON "submission_draft" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backing_active_member_key" ON "backing" USING btree ("submission_id","member_id") WHERE "backing"."state" = 'active';--> statement-breakpoint
CREATE INDEX "backing_submission_idx" ON "backing" USING btree ("submission_id","state");--> statement-breakpoint
CREATE INDEX "backing_ward_idx" ON "backing" USING btree ("ward_id_at_backing","state");--> statement-breakpoint
CREATE INDEX "backing_member_idx" ON "backing" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "comment_submission_idx" ON "comment" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "comment_routing_idx" ON "comment" USING btree ("routing_flag","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_code_key" ON "rule" USING btree ("code");--> statement-breakpoint
CREATE INDEX "moderation_action_queue_idx" ON "moderation_action" USING btree ("review_status","occurred_at");--> statement-breakpoint
CREATE INDEX "moderation_action_comment_idx" ON "moderation_action" USING btree ("comment_id","occurred_at");--> statement-breakpoint
CREATE INDEX "moderation_action_reviewer_idx" ON "moderation_action" USING btree ("assigned_reviewer_id","review_status");--> statement-breakpoint
CREATE INDEX "appeal_queue_idx" ON "appeal" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "appeal_comment_idx" ON "appeal" USING btree ("comment_id");--> statement-breakpoint
CREATE INDEX "legal_review_queue_idx" ON "legal_review" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "legal_review_submission_idx" ON "legal_review" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "legal_review_comment_idx" ON "legal_review" USING btree ("comment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "decision_root_key" ON "decision" USING btree ("submission_id") WHERE "decision"."supersedes_decision_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "decision_successor_key" ON "decision" USING btree ("supersedes_decision_id") WHERE "decision"."supersedes_decision_id" is not null;--> statement-breakpoint
CREATE INDEX "decision_submission_idx" ON "decision" USING btree ("submission_id","version");--> statement-breakpoint
CREATE INDEX "decision_published_idx" ON "decision" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "decision_draft_submission_idx" ON "decision_draft" USING btree ("submission_id","reserved_until");--> statement-breakpoint
CREATE INDEX "decision_draft_staff_idx" ON "decision_draft" USING btree ("staff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_decision_key" ON "commitment" USING btree ("decision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commitment_submission_key" ON "commitment" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "commitment_ward_idx" ON "commitment" USING btree ("ward_id","status");--> statement-breakpoint
CREATE INDEX "commitment_target_idx" ON "commitment" USING btree ("target_date","status");--> statement-breakpoint
CREATE INDEX "commitment_pillar_idx" ON "commitment" USING btree ("pillar","status");--> statement-breakpoint
CREATE INDEX "commitment_status_change_commitment_idx" ON "commitment_status_change" USING btree ("commitment_id","changed_at");--> statement-breakpoint
CREATE INDEX "commitment_status_change_time_idx" ON "commitment_status_change" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "delivery_evidence_commitment_idx" ON "delivery_evidence" USING btree ("commitment_id","recorded_at");--> statement-breakpoint
CREATE INDEX "budget_line_match_commitment_idx" ON "budget_line_match" USING btree ("commitment_id","status");--> statement-breakpoint
CREATE INDEX "budget_line_match_status_idx" ON "budget_line_match" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_rescheduled_from_key" ON "session" USING btree ("rescheduled_from_id") WHERE "session"."rescheduled_from_id" is not null;--> statement-breakpoint
CREATE INDEX "session_starts_idx" ON "session" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_member_session_key" ON "reservation" USING btree ("session_id","member_id");--> statement-breakpoint
CREATE INDEX "reservation_session_status_idx" ON "reservation" USING btree ("session_id","status","waitlist_position");--> statement-breakpoint
CREATE INDEX "session_question_selection_idx" ON "session_question" USING btree ("session_id","selected");--> statement-breakpoint
CREATE INDEX "session_question_member_idx" ON "session_question" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "report_card_quarter_idx" ON "report_card" USING btree ("quarter","status");--> statement-breakpoint
CREATE INDEX "report_card_correction_idx" ON "report_card" USING btree ("correction_of_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ward_report_snapshot_card_ward_key" ON "ward_report_snapshot" USING btree ("report_card_id","ward_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ward_pillar_snapshot_card_ward_pillar_key" ON "ward_pillar_snapshot" USING btree ("report_card_id","ward_id","pillar");--> statement-breakpoint
CREATE INDEX "data_request_queue_idx" ON "data_request" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "data_request_member_idx" ON "data_request" USING btree ("member_id","requested_at");--> statement-breakpoint
CREATE INDEX "audit_event_access_idx" ON "audit_event" USING btree ("occurred_at") WHERE "audit_event"."action" like 'member_data.%';--> statement-breakpoint
CREATE INDEX "audit_event_entity_idx" ON "audit_event" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_event_occurred_idx" ON "audit_event" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "model_evaluation_capability_idx" ON "model_evaluation" USING btree ("capability","run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_key_key" ON "idempotency_record" USING btree ("scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_record" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "search_document_document_idx" ON "search_document" USING gin ("document");--> statement-breakpoint
CREATE INDEX "search_document_ward_idx" ON "search_document" USING btree ("ward_id");--> statement-breakpoint
CREATE INDEX "search_document_pillar_idx" ON "search_document" USING btree ("pillar");--> statement-breakpoint
CREATE UNIQUE INDEX "search_document_submission_key" ON "search_document" USING btree ("submission_id");--> statement-breakpoint
-- ---------------------------------------------------------------------------------------------
-- Reviewed additions beyond drizzle-kit's generation.
--
-- 1. The audit log is append-only in the database, not only in code: a trigger refuses UPDATE,
--    DELETE and TRUNCATE for every role (C-090, NFR-028). A correction is a new event.
-- 2. Personal-data fields are classified where the column is introduced (packages/db/AGENTS.md).
-- 3. The two infrastructure tables are labelled as such: neither is part of the public record.
-- ---------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION "audit_event_reject_mutation"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_event_append_only"
  BEFORE UPDATE OR DELETE ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION "audit_event_reject_mutation"();--> statement-breakpoint
CREATE TRIGGER "audit_event_no_truncate"
  BEFORE TRUNCATE ON "audit_event"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_event_reject_mutation"();--> statement-breakpoint
COMMENT ON TABLE "audit_event" IS 'Append-only audit log (schema.md AuditEvent, C-090). sequence and correlation_id are infrastructure, not entity fields. Retention 24 months.';--> statement-breakpoint
COMMENT ON TABLE "idempotency_record" IS 'Infrastructure only (ADR-002): durable idempotency keys and stored responses. Never exported, never part of the public record.';--> statement-breakpoint
COMMENT ON TABLE "search_document" IS 'Derived full-text projection over published submissions (C-038). Rebuildable from submission; never a source of truth.';--> statement-breakpoint
COMMENT ON COLUMN "member"."telephone_number" IS 'Personal data, direct identifier (C-001, NFR-040). Never published, never in a search document, audit reason, analytics event or cache payload.';--> statement-breakpoint
COMMENT ON COLUMN "member"."full_name" IS 'Personal data, direct identifier (C-001, NFR-040). Held for attribution; never published.';--> statement-breakpoint
COMMENT ON COLUMN "member"."declared_age" IS 'Personal data (C-001, NFR-040). Used only to check the 18-35 band; never published.';--> statement-breakpoint
COMMENT ON COLUMN "pending_registration"."telephone_number" IS 'Personal data, direct identifier (C-001, NFR-040). The number the one-time code is sent to.';--> statement-breakpoint
COMMENT ON COLUMN "pending_registration"."full_name" IS 'Personal data, direct identifier (C-001, NFR-040). Held only until the code is accepted or the form expires.';--> statement-breakpoint
COMMENT ON COLUMN "pending_registration"."declared_age" IS 'Personal data (C-001, NFR-040). Used only to check the 18-35 band.';--> statement-breakpoint
COMMENT ON COLUMN "data_request"."member_id" IS 'Personal data (schema.md DataRequest). Never in an audit reason, a search document, an analytics event or a cache payload.';--> statement-breakpoint
COMMENT ON COLUMN "staff_user"."full_name" IS 'Personal data. Published only as a decision signatory or the display name on a moderation action.';--> statement-breakpoint
COMMENT ON COLUMN "residence_review"."notes" IS 'Personal free text: reviewer private note about a residence. Never published.';--> statement-breakpoint
COMMENT ON COLUMN "ward_description_review"."description" IS 'Personal free text: a resident''s own description of their area. Never in a search document, analytics event, cache payload or log line.';--> statement-breakpoint
COMMENT ON COLUMN "appeal"."reason" IS 'Personal free text: a member''s stated grounds. Visible only to the assigned reviewer and the operator path.';--> statement-breakpoint
COMMENT ON COLUMN "audit_event"."reason" IS 'Must not reproduce a name, telephone number, ward description or held text (C-090). The append is refused, not redacted.';