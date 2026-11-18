CREATE TABLE "outbound_notification" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"recipient_kind" text NOT NULL,
	"recipient_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"state" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp(0) with time zone NOT NULL,
	"created_at" timestamp(0) with time zone NOT NULL,
	"last_attempt_at" timestamp(0) with time zone,
	"last_outcome" text,
	"last_cause" text,
	"message_ref" text,
	"lease_token" text,
	"lease_until" timestamp(0) with time zone,
	"sent_at" timestamp(0) with time zone,
	"failed_at" timestamp(0) with time zone,
	CONSTRAINT "outbound_notification_id_format" CHECK ("outbound_notification"."id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "outbound_notification_channel_domain" CHECK ("outbound_notification"."channel" in ('sms', 'in_product')),
	CONSTRAINT "outbound_notification_template_domain" CHECK ("outbound_notification"."template" in ('registration_code', 'decision_published', 'appeal_decided', 'session_reminder', 'data_request_outcome')),
	CONSTRAINT "outbound_notification_recipient_kind_domain" CHECK ("outbound_notification"."recipient_kind" in ('member', 'pending_registration')),
	CONSTRAINT "outbound_notification_recipient_prefix" CHECK (("outbound_notification"."recipient_kind" = 'member' and "outbound_notification"."recipient_id" ~ '^mbr_[0-9A-Z]{4,26}$')
        or ("outbound_notification"."recipient_kind" = 'pending_registration' and "outbound_notification"."recipient_id" ~ '^prg_[0-9A-Z]{4,26}$')),
	CONSTRAINT "outbound_notification_state_domain" CHECK ("outbound_notification"."state" in ('queued', 'sent', 'failed')),
	CONSTRAINT "outbound_notification_attempt_outcome_domain" CHECK ("outbound_notification"."last_outcome" is null or "outbound_notification"."last_outcome" in ('delivered', 'held', 'failed')),
	CONSTRAINT "outbound_notification_attempts_non_negative" CHECK ("outbound_notification"."attempts" >= 0),
	CONSTRAINT "outbound_notification_terminal_instants" CHECK (("outbound_notification"."state" = 'queued' and "outbound_notification"."sent_at" is null and "outbound_notification"."failed_at" is null)
        or ("outbound_notification"."state" = 'sent' and "outbound_notification"."sent_at" is not null and "outbound_notification"."failed_at" is null)
        or ("outbound_notification"."state" = 'failed' and "outbound_notification"."failed_at" is not null and "outbound_notification"."sent_at" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_notification_dedupe_key_key" ON "outbound_notification" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "outbound_notification_due_idx" ON "outbound_notification" USING btree ("state","next_attempt_at");--> statement-breakpoint
CREATE INDEX "outbound_notification_held_idx" ON "outbound_notification" USING btree ("next_attempt_at") WHERE "outbound_notification"."state" = 'queued' and "outbound_notification"."last_outcome" = 'held';