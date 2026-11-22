-- Reverse of 0004_one_account_per_number.sql
-- (packages/db/AGENTS.md: every migration ships a tested down path).
--
-- The rollback restores the pre-migration shape: the shared-number flag returns with a default for
-- every existing row, because no earlier value was preserved when the column was dropped, and the
-- plain lookup index replaces the live-account uniqueness rule. It never deletes a row to make a
-- constraint fit, and the forward migration is the only route a shared environment takes.

ALTER TABLE "member" ADD COLUMN "shared_number" boolean;

UPDATE "member" SET "shared_number" = false WHERE "shared_number" IS NULL;

ALTER TABLE "member" ALTER COLUMN "shared_number" SET NOT NULL;

DROP INDEX IF EXISTS "member_telephone_live_key";

CREATE INDEX "member_telephone_idx" ON "member" USING btree ("telephone_number");
