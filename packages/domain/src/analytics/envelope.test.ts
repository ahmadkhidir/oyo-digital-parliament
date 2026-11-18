/**
 * The `C-089` envelope: accepted events, refused events, and the no-personal-data rule.
 *
 * Every refusal asserts both the `C-001` code and its stable cause, and the field path that produced
 * it. A refusal that only said "invalid" would be untraceable at the call site.
 */
import { describe, expect, it } from 'vitest';

import { buildAnalyticsEvent, parseAnalyticsEmitRequest, type AnalyticsEventInput } from './envelope.ts';

/** A registered member's identity: pseudonymous, with no anonymous id alongside it. */
const REGISTERED = { userId: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA', anonymousId: null } as const;

/** A visitor's identity: no member id yet. */
const VISITOR = { userId: null, anonymousId: 'ano_01J9ZQ3T5V7W9X1Y3Z5A7B9CD' } as const;

/** The envelope's shared fields, as a valid `screen_viewed` event (`EVT-001`). */
function screenViewed(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    event_name: 'screen_viewed',
    event_id: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB',
    occurred_at: '2026-11-25T12:00:00Z',
    user_id: REGISTERED.userId,
    anonymous_id: null,
    session_id: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
    platform: 'web',
    app_version: '2026.11.3',
    locale: 'en-NG',
    properties: { screen: 'home', device_class: 'mobile', signed_in: false },
    ...overrides,
  };
}

/** A built `decision_published` event (`EVT-026`), the contract's own example. */
const DECISION_PUBLISHED: AnalyticsEventInput<'decision_published'> = {
  name: 'decision_published',
  properties: { decision_type: 'commit', days_since_submission: 7, version: 1 },
  eventId: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB',
  occurredAt: '2026-11-25T12:00:00Z',
  sessionId: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
  userId: REGISTERED.userId,
  anonymousId: null,
  appVersion: '2026.11.3',
  locale: 'en-NG',
};

describe('analytics envelope', () => {
  it('builds the exact shape C-089 declares, with the common properties and nothing extra', () => {
    const result = buildAnalyticsEvent(DECISION_PUBLISHED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.request).sort()).toEqual(
      [
        'anonymous_id',
        'app_version',
        'event_id',
        'event_name',
        'locale',
        'occurred_at',
        'platform',
        'properties',
        'session_id',
        'user_id',
      ].sort(),
    );
    expect(result.request).toMatchObject({
      event_name: 'decision_published',
      platform: 'web',
      locale: 'en-NG',
      user_id: REGISTERED.userId,
      anonymous_id: null,
      properties: { decision_type: 'commit', days_since_submission: 7, version: 1 },
    });
  });

  it('carries an anonymous identifier before registration and none after it', () => {
    const visitor = parseAnalyticsEmitRequest(
      screenViewed({ user_id: null, anonymous_id: VISITOR.anonymousId }),
    );
    expect(visitor.ok).toBe(true);
    if (visitor.ok) {
      expect(visitor.request.user_id).toBeNull();
      expect(visitor.request.anonymous_id).toBe(VISITOR.anonymousId);
    }

    const member = parseAnalyticsEmitRequest(screenViewed());
    expect(member.ok).toBe(true);
    if (member.ok) expect(member.request.anonymous_id).toBeNull();
  });

  it('round-trips a built event through the receiving validator', () => {
    const built = buildAnalyticsEvent(DECISION_PUBLISHED);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const parsed = parseAnalyticsEmitRequest(built.request);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.request).toEqual(built.request);
  });

  it('refuses an envelope that carries both identities, or neither', () => {
    const both = parseAnalyticsEmitRequest(
      screenViewed({ user_id: REGISTERED.userId, anonymous_id: VISITOR.anonymousId }),
    );
    expect(both.ok).toBe(false);
    if (!both.ok) {
      expect(both.code).toBe('VALIDATION_FAILED');
      expect(both.cause).toBe('EVENT_ENVELOPE_INVALID');
      expect(both.fields['anonymous_id']).toBe('ALREADY_SET');
    }

    const neither = parseAnalyticsEmitRequest(screenViewed({ user_id: null }));
    expect(neither.ok).toBe(false);
    if (!neither.ok) expect(neither.fields['user_id']).toBe('REQUIRED');
  });

  it('refuses a missing common property and names it', () => {
    const raw = screenViewed();
    delete raw['session_id'];
    const result = parseAnalyticsEmitRequest(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.fields['session_id']).toBe('REQUIRED');
    }
  });

  it('refuses an event name outside the taxonomy', () => {
    const result = parseAnalyticsEmitRequest(screenViewed({ event_name: 'screen_view' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.cause).toBe('UNKNOWN_EVENT_NAME');
      expect(result.fields['event_name']).toBe('ENUM_MISMATCH');
    }
  });

  it('refuses a missing event name', () => {
    const raw = screenViewed();
    delete raw['event_name'];
    const result = parseAnalyticsEmitRequest(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.cause).toBe('EVENT_NAME_REQUIRED');
  });

  it('refuses a property the taxonomy does not declare for that event', () => {
    const result = parseAnalyticsEmitRequest(
      screenViewed({ properties: { screen: 'home', device_class: 'mobile', signed_in: false, ward_id: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM' } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields['properties.ward_id']).toBe('UNKNOWN_FIELD');
  });

  it('refuses an envelope field the contract does not declare', () => {
    const result = parseAnalyticsEmitRequest(screenViewed({ screen_name: 'home' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cause).toBe('ENVELOPE_FIELD_NOT_DECLARED');
      expect(result.fields['screen_name']).toBe('UNKNOWN_FIELD');
    }
  });

  it('refuses a declared property whose value leaves its kind', () => {
    const notBoolean = parseAnalyticsEmitRequest(
      screenViewed({ properties: { screen: 'home', device_class: 'mobile', signed_in: 'yes' } }),
    );
    expect(notBoolean.ok).toBe(false);
    if (!notBoolean.ok) expect(notBoolean.fields['properties.signed_in']).toBe('OUT_OF_BAND');

    const outOfBand = parseAnalyticsEmitRequest(
      screenViewed({
        event_name: 'similar_submission_shown',
        properties: { candidate_count: 7, top_similarity_band: 'high' },
      }),
    );
    expect(outOfBand.ok).toBe(false);
    if (!outOfBand.ok) expect(outOfBand.fields['properties.candidate_count']).toBe('OUT_OF_BAND');

    const wrongEnum = parseAnalyticsEmitRequest(
      screenViewed({
        event_name: 'submission_published',
        properties: {
          type: 'proposal',
          pillar: 'education',
          ward_id: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
          location_scope: 'in_state',
          source: 'letter',
          has_cost_band: true,
          contains_named_entity: false,
        },
      }),
    );
    expect(wrongEnum.ok).toBe(false);
    if (!wrongEnum.ok) expect(wrongEnum.fields['properties.source']).toBe('ENUM_MISMATCH');
  });

  it('refuses a malformed identifier, timestamp or version', () => {
    const badId = parseAnalyticsEmitRequest(screenViewed({ event_id: '01J9ZQ1R3S5T7V9W1X3Y5Z7AB' }));
    expect(badId.ok).toBe(false);
    if (!badId.ok) expect(badId.fields['event_id']).toBe('PATTERN_MISMATCH');

    const badTime = parseAnalyticsEmitRequest(screenViewed({ occurred_at: '2026-11-25T12:00:00+01:00' }));
    expect(badTime.ok).toBe(false);
    if (!badTime.ok) expect(badTime.fields['occurred_at']).toBe('PATTERN_MISMATCH');

    const badVersion = parseAnalyticsEmitRequest(screenViewed({ app_version: 'main' }));
    expect(badVersion.ok).toBe(false);
    if (!badVersion.ok) expect(badVersion.fields['app_version']).toBe('PATTERN_MISMATCH');

    const badLocale = parseAnalyticsEmitRequest(screenViewed({ locale: 'fr-FR' }));
    expect(badLocale.ok).toBe(false);
    if (!badLocale.ok) expect(badLocale.fields['locale']).toBe('ENUM_MISMATCH');
  });

  it('requires a correlation id on a model event and on a failure event (C-089)', () => {
    const model: AnalyticsEventInput<'model_fallback_triggered'> = {
      ...DECISION_PUBLISHED,
      name: 'model_fallback_triggered',
      properties: { capability: 'similar_submission', reason_code: 'TIMEOUT' },
    };
    const withoutCorrelation = buildAnalyticsEvent(model);
    expect(withoutCorrelation.ok).toBe(false);
    if (!withoutCorrelation.ok) expect(withoutCorrelation.fields['correlation_id']).toBe('REQUIRED');

    const withCorrelation = buildAnalyticsEvent({ ...model, correlationId: 'req_01J9Z6M2V4' });
    expect(withCorrelation.ok).toBe(true);
    if (withCorrelation.ok) expect(withCorrelation.request.correlation_id).toBe('req_01J9Z6M2V4');

    const failure: AnalyticsEventInput<'submission_publish_failed'> = {
      ...DECISION_PUBLISHED,
      name: 'submission_publish_failed',
      properties: { failure_code: 'COST_BAND_MISSING' },
    };
    expect(buildAnalyticsEvent(failure).ok).toBe(false);
  });

  it('refuses a property key that names a person', () => {
    for (const key of ['full_name', 'telephone_number', 'display_name', 'member_id', 'ward_description']) {
      const result = parseAnalyticsEmitRequest(
        screenViewed({ properties: { screen: 'home', device_class: 'mobile', signed_in: false, [key]: 'x' } }),
      );
      expect(result.ok, key).toBe(false);
      if (!result.ok) {
        expect(result.code, key).toBe('POLICY_VIOLATION');
        expect(result.cause, key).toBe('PERSONAL_DATA_IN_EVENT');
        expect(result.fields[key], key).toBe('UNKNOWN_FIELD');
      }
    }
  });

  it('refuses a telephone number hidden in a code-shaped property', () => {
    const result = parseAnalyticsEmitRequest(
      screenViewed({
        event_name: 'submission_publish_failed',
        correlation_id: 'req_01J9Z6M2V4',
        properties: { failure_code: '08031234567' },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('POLICY_VIOLATION');
      expect(result.cause).toBe('PERSONAL_DATA_IN_EVENT');
      expect(result.fields['failure_code']).toBe('PATTERN_MISMATCH');
    }
  });

  it('refuses a ward description or an excerpt of what a resident wrote', () => {
    const description = parseAnalyticsEmitRequest(
      screenViewed({
        event_name: 'ward_sent_for_review',
        properties: { lga_matched: true, ward_description: 'Bodija ward three near the market' },
      }),
    );
    expect(description.ok).toBe(false);
    if (!description.ok) expect(description.cause).toBe('PERSONAL_DATA_IN_EVENT');

    const excerpt = parseAnalyticsEmitRequest(
      screenViewed({ properties: { screen: 'the road behind the school has flooded again every rainy season' } }),
    );
    expect(excerpt.ok).toBe(false);
    if (!excerpt.ok) {
      expect(excerpt.code).toBe('POLICY_VIOLATION');
      expect(excerpt.fields['screen']).toBe('PATTERN_MISMATCH');
    }
  });

  it('refuses a nested value as malformed rather than as personal data', () => {
    const result = parseAnalyticsEmitRequest(
      screenViewed({ properties: { screen: 'home', device_class: 'mobile', signed_in: false, extra: { a: 1 } } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.fields['extra']).toBe('OUT_OF_BAND');
    }
  });

  it('refuses a body that is not an object and one with no properties', () => {
    const notAnObject = parseAnalyticsEmitRequest('screen_viewed');
    expect(notAnObject.ok).toBe(false);
    if (!notAnObject.ok) expect(notAnObject.cause).toBe('ENVELOPE_MALFORMED');

    const raw = screenViewed();
    delete raw['properties'];
    const noProperties = parseAnalyticsEmitRequest(raw);
    expect(noProperties.ok).toBe(false);
    if (!noProperties.ok) expect(noProperties.fields['properties']).toBe('REQUIRED');
  });
});
