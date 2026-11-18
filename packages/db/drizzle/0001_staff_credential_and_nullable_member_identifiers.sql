CREATE TABLE "staff_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_user_id" text NOT NULL,
	"username" varchar(32) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"password_changed_at" timestamp(0) with time zone,
	"totp_secret_encrypted" text,
	"second_factor_enrolled_at" timestamp(0) with time zone,
	"recovery_codes" jsonb NOT NULL,
	"failed_attempt_count" integer NOT NULL,
	"locked_until" timestamp(0) with time zone,
	"last_sign_in_at" timestamp(0) with time zone,
	"created_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "staff_credential_id_format" CHECK ("staff_credential"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "staff_credential_username_format" CHECK ("staff_credential"."username" ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
	CONSTRAINT "staff_credential_failed_attempts" CHECK ("staff_credential"."failed_attempt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "telephone_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "full_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "declared_age" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_credential" ADD CONSTRAINT "staff_credential_staff_user_id_staff_user_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_credential_username_key" ON "staff_credential" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_credential_staff_user_key" ON "staff_credential" USING btree ("staff_user_id");