-- Reverse of 0005_data_request_legal_hold_review_at.sql
-- (packages/db/AGENTS.md: every migration ships a tested down path).
--
-- The rollback removes the structured review date and the constraint that keeps it beside a deferral.
-- It never deletes a request row: the reason and every other field stay, and the forward migration is
-- the only route a shared environment takes.

ALTER TABLE "data_request" DROP CONSTRAINT IF EXISTS "data_request_legal_hold_review_at";

ALTER TABLE "data_request" DROP COLUMN IF EXISTS "legal_hold_review_at";
