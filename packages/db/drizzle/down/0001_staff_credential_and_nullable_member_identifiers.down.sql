-- Reverse of 0001_staff_credential_and_nullable_member_identifiers.sql
-- (packages/db/AGENTS.md: every migration ships a tested down path).
--
-- The down path restores the pre-migration representation rather than refusing on anonymised rows: the
-- previous schema held a deleted member's direct identifiers as reserved non-identifying values, so a
-- row this migration nulled is put back to exactly those values before the NOT NULL constraints return.
-- That keeps the rollback runnable on a database where a deletion has already happened, and it keeps
-- every row (nothing is deleted to make a constraint fit).
--
-- Production never runs this path without a written decision; the forward migration is the only route a
-- shared environment takes.

UPDATE "member" SET "telephone_number" = '+2340000000000' WHERE "telephone_number" IS NULL;

UPDATE "member" SET "full_name" = 'Deleted member' WHERE "full_name" IS NULL;

UPDATE "member" SET "declared_age" = 18 WHERE "declared_age" IS NULL;

ALTER TABLE "member" ALTER COLUMN "telephone_number" SET NOT NULL;

ALTER TABLE "member" ALTER COLUMN "full_name" SET NOT NULL;

ALTER TABLE "member" ALTER COLUMN "declared_age" SET NOT NULL;

DROP TABLE IF EXISTS "staff_credential" CASCADE;
