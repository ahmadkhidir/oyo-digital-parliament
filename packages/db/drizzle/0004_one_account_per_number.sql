DROP INDEX "member_telephone_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "member_telephone_live_key" ON "member" USING btree ("telephone_number") WHERE "member"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "shared_number";