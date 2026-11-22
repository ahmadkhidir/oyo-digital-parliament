/**
 * AnalyticsEvent — the durable sink behind `C-089` (`C-077` operation `analytics.emit`,
 * `analytics.md` Analytics Data Governance, `nfr.md` Data lifecycle).
 *
 * `analytics.md` states that how events are collected and stored is the implementer's decision, and
 * that they are retained for 26 months and then aggregated. The platform's record store is already
 * PostgreSQL, so the sink is one table in it: one row per validated `C-089` envelope, written by the
 * analytics store port. This is infrastructure rather than a `schema.md` product entity — nothing the
 * public record renders is derived from it — and it is the reason no separate analytics vendor is
 * introduced.
 *
 * The row is the envelope and nothing more:
 *
 * - every column holds a value `C-089` already fixes, so an event cannot gain a field on the way in;
 * - `event_id` is the primary key, which makes a re-delivered event a no-op rather than a second
 *   count — the dispatcher's retry buffer can replay an event without inflating a funnel;
 * - exactly one of `user_id` and `anonymous_id` is present, which the envelope enforces and the
 *   database refuses to break.
 *
 * Two columns are **infrastructure, not envelope properties**:
 *
 * - `stored_at` is the instant `C-089` echoes back as `storedAt`; it is the database's own `now()`,
 *   so two instances storing the same instant agree on it.
 * - `expires_at` is the 26-month retention instant `nfr.md` fixes, computed from `occurred_at` when
 *   the row is written. The sweep needs no clock of its own, a row cannot outlive the retention its
 *   own record states, and the aggregation that follows expiry can be verified against the same
 *   instant.
 *
 * `user_id` holds a `usr_` identifier until a deletion request replaces it, and the non-reversible
 * `tok_` token afterwards (`C-077` operation `analytics.replaceUserToken`); the column therefore
 * accepts the general `C-001` identifier form rather than one prefix. No column holds a name, a
 * telephone number, a ward description or free text, and `properties` is a flat JSON object of the
 * taxonomy's scalars, never a nested document.
 *
 * Field-level classification: no column is personal data in the `C-001` sense. `user_id` and
 * `anonymous_id` are pseudonymous identifiers that `C-089` requires, not direct identifiers, and the
 * remaining columns are the event's name, time, session, release and locale. The table therefore
 * carries no member name, telephone number, ward description or authored text to classify.
 */
import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';

/**
 * How long a raw event is kept before it is aggregated (`nfr.md` Data lifecycle: "Analytics events |
 * 26 months, then aggregated | ... | Anonymised on expiry"; `analytics.md` Analytics Data Governance).
 */
export const ANALYTICS_RETENTION_MONTHS = 26;

/** A taxonomy property value: the three JSON scalars, and no object or array. */
export type AnalyticsPropertyValue = string | number | boolean;

export const analyticsEvent = pgTable(
  'analytics_event',
  {
    /** `C-089` `event_id`, and the idempotency key of the sink. */
    eventId: text('event_id').primaryKey(),
    /** The taxonomy name (`analytics.md` Event Taxonomy). */
    eventName: varchar('event_name', { length: 60 }).notNull(),
    occurredAt: utcTimestamp('occurred_at').notNull(),
    /** Pseudonymous member id: `usr_` before a deletion request, `tok_` afterwards, `null` before registration. */
    userId: text('user_id'),
    /** Pre-registration identifier (`prg_` at registration), `null` once the account exists. */
    anonymousId: text('anonymous_id'),
    sessionId: text('session_id').notNull(),
    platform: varchar('platform', { length: 16 }).notNull(),
    appVersion: varchar('app_version', { length: 16 }).notNull(),
    locale: varchar('locale', { length: 8 }).notNull(),
    /** The `C-001` request identifier, required by the envelope on a model or failure event. */
    correlationId: text('correlation_id'),
    /** The taxonomy's declared properties: flat scalars, validated by `@odp/domain` before the write. */
    properties: jsonb('properties')
      .$type<Readonly<Record<string, AnalyticsPropertyValue>>>()
      .notNull(),
    /** Infrastructure: the instant `C-089` returns as `storedAt`. */
    storedAt: utcTimestamp('stored_at')
      .notNull()
      .default(sql`now()`),
    /** Infrastructure: the retention instant, `occurred_at` plus `ANALYTICS_RETENTION_MONTHS`. */
    expiresAt: utcTimestamp('expires_at').notNull(),
  },
  (t) => [
    check('analytics_event_event_id_format', sql`${t.eventId} ~ '^evt_[0-9A-Z]{4,26}$'`),
    check('analytics_event_event_name_format', sql`${t.eventName} ~ '^[a-z][a-z0-9_]*$'`),
    // `C-089`: exactly one identity. Both is as wrong as neither.
    check('analytics_event_one_identity', sql`(${t.userId} is null) <> (${t.anonymousId} is null)`),
    check('analytics_event_user_id_format', sql`${t.userId} is null or ${isIdentifier(t.userId)}`),
    check(
      'analytics_event_anonymous_id_format',
      sql`${t.anonymousId} is null or ${t.anonymousId} ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'`,
    ),
    check('analytics_event_session_id_format', isIdentifier(t.sessionId)),
    check('analytics_event_platform_domain', sql`${t.platform} in ('web')`),
    check(
      'analytics_event_app_version_format',
      sql`${t.appVersion} ~ '^[0-9]{4}\\.[0-9]{1,2}\\.[0-9]+$'`,
    ),
    check('analytics_event_locale_domain', sql`${t.locale} in ('en-NG', 'yo-NG')`),
    check(
      'analytics_event_correlation_format',
      sql`${t.correlationId} is null or ${t.correlationId} ~ '^req_[0-9A-Z]{4,32}$'`,
    ),
    // No declared kind holds an object or an array, so a nested value is a malformed event.
    check('analytics_event_properties_object', sql`jsonb_typeof(${t.properties}) = 'object'`),
    check('analytics_event_retention_after_occurrence', sql`${t.expiresAt} > ${t.occurredAt}`),
    // Read path: the funnel and conversion queries in `analytics.md` count one event name over a
    // period, so the index leads with the name and orders by the instant.
    index('analytics_event_name_occurred_idx').on(t.eventName, t.occurredAt),
    // Read path: `analytics.replaceUserToken` rewrites one member's events (`C-077`).
    index('analytics_event_user_idx').on(t.userId),
    // Read path: the 26-month retention sweep (`nfr.md` Data lifecycle).
    index('analytics_event_expiry_idx').on(t.expiresAt),
  ],
);
