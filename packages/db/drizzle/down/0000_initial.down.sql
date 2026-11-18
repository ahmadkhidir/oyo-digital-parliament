-- Reverse of 0000_initial.sql (packages/db/AGENTS.md: every migration ships a tested down path).
--
-- This file is run by the migration round-trip test and by an operator rolling a disposable
-- environment back. CASCADE is used deliberately: the down path removes this migration's own objects,
-- and a dependent object can only be one it created. Production never runs this path without a
-- written decision (the forward migration is the only route a shared environment takes).

DROP TRIGGER IF EXISTS "audit_event_no_truncate" ON "audit_event";
DROP TRIGGER IF EXISTS "audit_event_append_only" ON "audit_event";
DROP FUNCTION IF EXISTS "audit_event_reject_mutation"();

DROP TABLE IF EXISTS "search_document" CASCADE;
DROP TABLE IF EXISTS "idempotency_record" CASCADE;
DROP TABLE IF EXISTS "model_evaluation" CASCADE;
DROP TABLE IF EXISTS "audit_event" CASCADE;
DROP TABLE IF EXISTS "data_request" CASCADE;
DROP TABLE IF EXISTS "ward_pillar_snapshot" CASCADE;
DROP TABLE IF EXISTS "ward_report_snapshot" CASCADE;
DROP TABLE IF EXISTS "report_card" CASCADE;
DROP TABLE IF EXISTS "session_question" CASCADE;
DROP TABLE IF EXISTS "reservation" CASCADE;
DROP TABLE IF EXISTS "session" CASCADE;
DROP TABLE IF EXISTS "budget_line_match" CASCADE;
DROP TABLE IF EXISTS "delivery_evidence" CASCADE;
DROP TABLE IF EXISTS "commitment_status_change" CASCADE;
DROP TABLE IF EXISTS "commitment" CASCADE;
DROP TABLE IF EXISTS "decision_draft" CASCADE;
DROP TABLE IF EXISTS "decision" CASCADE;
DROP TABLE IF EXISTS "legal_review" CASCADE;
DROP TABLE IF EXISTS "appeal" CASCADE;
DROP TABLE IF EXISTS "moderation_action" CASCADE;
DROP TABLE IF EXISTS "rule" CASCADE;
DROP TABLE IF EXISTS "comment" CASCADE;
DROP TABLE IF EXISTS "backing" CASCADE;
DROP TABLE IF EXISTS "submission_draft" CASCADE;
DROP TABLE IF EXISTS "submission" CASCADE;
DROP TABLE IF EXISTS "ward_description_review" CASCADE;
DROP TABLE IF EXISTS "consent" CASCADE;
DROP TABLE IF EXISTS "residence_review" CASCADE;
DROP TABLE IF EXISTS "member" CASCADE;
DROP TABLE IF EXISTS "staff_user" CASCADE;
DROP TABLE IF EXISTS "pending_registration" CASCADE;
DROP TABLE IF EXISTS "ward" CASCADE;

DROP TYPE IF EXISTS "ward_status" CASCADE;
DROP TYPE IF EXISTS "ward_source" CASCADE;
DROP TYPE IF EXISTS "ward_description_review_status" CASCADE;
DROP TYPE IF EXISTS "verification_method" CASCADE;
DROP TYPE IF EXISTS "submission_type" CASCADE;
DROP TYPE IF EXISTS "submission_status" CASCADE;
DROP TYPE IF EXISTS "submission_source" CASCADE;
DROP TYPE IF EXISTS "submission_draft_status" CASCADE;
DROP TYPE IF EXISTS "staff_role" CASCADE;
DROP TYPE IF EXISTS "session_status" CASCADE;
DROP TYPE IF EXISTS "session_question_outcome" CASCADE;
DROP TYPE IF EXISTS "routing_flag" CASCADE;
DROP TYPE IF EXISTS "residence_review_method" CASCADE;
DROP TYPE IF EXISTS "residence_review_decision" CASCADE;
DROP TYPE IF EXISTS "reservation_status" CASCADE;
DROP TYPE IF EXISTS "report_card_status" CASCADE;
DROP TYPE IF EXISTS "pillar" CASCADE;
DROP TYPE IF EXISTS "moderation_review_status" CASCADE;
DROP TYPE IF EXISTS "moderation_action_kind" CASCADE;
DROP TYPE IF EXISTS "model_capability" CASCADE;
DROP TYPE IF EXISTS "location_scope" CASCADE;
DROP TYPE IF EXISTS "locale" CASCADE;
DROP TYPE IF EXISTS "legal_review_status" CASCADE;
DROP TYPE IF EXISTS "identity_state" CASCADE;
DROP TYPE IF EXISTS "delivery_evidence_type" CASCADE;
DROP TYPE IF EXISTS "decision_type" CASCADE;
DROP TYPE IF EXISTS "data_request_type" CASCADE;
DROP TYPE IF EXISTS "data_request_status" CASCADE;
DROP TYPE IF EXISTS "cost_band" CASCADE;
DROP TYPE IF EXISTS "consent_purpose" CASCADE;
DROP TYPE IF EXISTS "commitment_status" CASCADE;
DROP TYPE IF EXISTS "comment_status" CASCADE;
DROP TYPE IF EXISTS "budget_line_match_status" CASCADE;
DROP TYPE IF EXISTS "backing_state" CASCADE;
DROP TYPE IF EXISTS "appeal_status" CASCADE;
DROP TYPE IF EXISTS "actor_role" CASCADE;

-- The migration journal is part of what this migration applied: dropping it is what makes the down
-- path a real rollback rather than a schema that drizzle-kit still believes is migrated. A re-apply
-- then runs the forward migration again, which the round-trip test exercises.
DROP SCHEMA IF EXISTS "drizzle" CASCADE;
