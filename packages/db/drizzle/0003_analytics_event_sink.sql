CREATE TABLE "analytics_event" (
	"event_id" text PRIMARY KEY NOT NULL,
	"event_name" varchar(60) NOT NULL,
	"occurred_at" timestamp(0) with time zone NOT NULL,
	"user_id" text,
	"anonymous_id" text,
	"session_id" text NOT NULL,
	"platform" varchar(16) NOT NULL,
	"app_version" varchar(16) NOT NULL,
	"locale" varchar(8) NOT NULL,
	"correlation_id" text,
	"properties" jsonb NOT NULL,
	"stored_at" timestamp(0) with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp(0) with time zone NOT NULL,
	CONSTRAINT "analytics_event_event_id_format" CHECK ("analytics_event"."event_id" ~ '^evt_[0-9A-Z]{4,26}$'),
	CONSTRAINT "analytics_event_event_name_format" CHECK ("analytics_event"."event_name" ~ '^[a-z][a-z0-9_]*$'),
	CONSTRAINT "analytics_event_one_identity" CHECK (("analytics_event"."user_id" is null) <> ("analytics_event"."anonymous_id" is null)),
	CONSTRAINT "analytics_event_user_id_format" CHECK ("analytics_event"."user_id" is null or "analytics_event"."user_id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "analytics_event_anonymous_id_format" CHECK ("analytics_event"."anonymous_id" is null or "analytics_event"."anonymous_id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "analytics_event_session_id_format" CHECK ("analytics_event"."session_id" ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'),
	CONSTRAINT "analytics_event_platform_domain" CHECK ("analytics_event"."platform" in ('web')),
	CONSTRAINT "analytics_event_app_version_format" CHECK ("analytics_event"."app_version" ~ '^[0-9]{4}\.[0-9]{1,2}\.[0-9]+$'),
	CONSTRAINT "analytics_event_locale_domain" CHECK ("analytics_event"."locale" in ('en-NG', 'yo-NG')),
	CONSTRAINT "analytics_event_correlation_format" CHECK ("analytics_event"."correlation_id" is null or "analytics_event"."correlation_id" ~ '^req_[0-9A-Z]{4,32}$'),
	CONSTRAINT "analytics_event_properties_object" CHECK (jsonb_typeof("analytics_event"."properties") = 'object'),
	CONSTRAINT "analytics_event_retention_after_occurrence" CHECK ("analytics_event"."expires_at" > "analytics_event"."occurred_at")
);
--> statement-breakpoint
CREATE INDEX "analytics_event_name_occurred_idx" ON "analytics_event" USING btree ("event_name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_event_user_idx" ON "analytics_event" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "analytics_event_expiry_idx" ON "analytics_event" USING btree ("expires_at");