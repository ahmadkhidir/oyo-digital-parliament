/**
 * Shared test inputs for the telemetry tests.
 *
 * The envelope is built by `@odp/domain`, so the fixtures below carry only what the dispatcher adds:
 * a valid `EVT-001` envelope in the `C-089` shape.
 */
import type { AnalyticsEmitRequest } from '@odp/domain';

/** A `screen_viewed` envelope for a registered member, as the dispatcher sends it. */
export function screenViewed(eventId: string): AnalyticsEmitRequest {
  return {
    event_name: 'screen_viewed',
    event_id: eventId,
    occurred_at: '2026-11-25T12:00:00Z',
    user_id: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
    anonymous_id: null,
    session_id: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
    platform: 'web',
    app_version: '2026.11.3',
    locale: 'en-NG',
    properties: { screen: 'home', device_class: 'mobile', signed_in: true },
  };
}
