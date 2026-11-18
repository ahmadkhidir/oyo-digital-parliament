/**
 * The identity analytics adapter: every identity event leaves with a subject, a schema-valid envelope
 * and no personal field (`C-089`, `EVT-003`, `EVT-004`, `EVT-042`).
 *
 * The domain's own tests prove that the use cases name the subject. These tests prove what the
 * deployable does with it: `user_id` or `anonymous_id` and never both, the locale the resident is
 * reading, no token from the session cookie, and a refusal that is reported rather than silently
 * dropped.
 */
import { describe, expect, it } from 'vitest';
import type { AnalyticsEmitRequest, IdentityAnalyticsEvent } from '@odp/domain';

import { createTelemetryBuffer } from '../telemetry';
import { createIdentityAnalytics, type IdentityAnalyticsOptions } from './ports';

/** A clock stuck at the contract's example instant. */
const clock = { now: () => new Date('2026-11-25T12:00:00.000Z') };

/** An identifier source that counts, so a test can prove one id is minted per event. */
function identifiers() {
  const calls: string[] = [];
  let sequence = 0;
  return {
    calls,
    next(prefix: string) {
      sequence += 1;
      calls.push(prefix);
      return `${prefix}_01J9ZQ1R3S5T7V9W1X3Y5Z${String(sequence).padStart(2, '0')}`;
    },
  };
}

/** A sink that records every envelope it was given, and fails on demand. */
function sink(options: { fails?: boolean } = {}) {
  const emitted: AnalyticsEmitRequest[] = [];
  return {
    emitted,
    async emit(request: AnalyticsEmitRequest) {
      if (options.fails === true) throw new Error('analytics unavailable');
      emitted.push(request);
      return { storedAt: '2026-11-25T12:00:01Z' };
    },
  };
}

/** Collects what the adapter reported, which is where a drop becomes visible. */
function reporter() {
  const reported: { readonly kind: string; readonly cause?: string }[] = [];
  return {
    reported,
    report(failure: { readonly kind: string; readonly cause?: string }) {
      reported.push(failure);
    },
  };
}

/** An adapter over the given effects. */
function adapterFor(
  store: ReturnType<typeof sink>,
  extra: Partial<IdentityAnalyticsOptions> = {},
) {
  const report = reporter();
  const buffer = createTelemetryBuffer();
  const adapter = createIdentityAnalytics({
    sink: store,
    clock,
    identifiers: identifiers(),
    appVersion: '2026.11.3',
    reporter: report,
    buffer,
    ...extra,
  });
  return { adapter, report, buffer };
}

/** The two events `C-003` produces once the account exists. */
const NUMBER_CONFIRMED: IdentityAnalyticsEvent = {
  name: 'number_confirmed',
  properties: { attempts: 1, delivery_delay_band: 'under_30s' },
  subject: { kind: 'member', memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' },
  locale: 'yo-NG',
};

const ACCOUNT_REGISTERED: IdentityAnalyticsEvent = {
  name: 'account_registered',
  properties: {
    identity_state: 'registered',
    verification_method: 'self_code',
    shared_number: false,
    ward_resolved: false,
    locale: 'yo-NG',
  },
  subject: { kind: 'member', memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' },
  locale: 'yo-NG',
};

describe('identity analytics adapter (C-089)', () => {
  it('envelopes number_confirmed against the member the code was accepted for', async () => {
    const store = sink();
    await adapterFor(store).adapter.emit(NUMBER_CONFIRMED);

    expect(store.emitted).toHaveLength(1);
    expect(store.emitted[0]).toEqual({
      event_name: 'number_confirmed',
      event_id: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z02',
      occurred_at: '2026-11-25T12:00:00Z',
      // `EVT-003`: one member, pseudonymous. The account exists, so there is no anonymous id.
      user_id: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
      anonymous_id: null,
      session_id: 'ses_01J9ZQ1R3S5T7V9W1X3Y5Z01',
      platform: 'web',
      app_version: '2026.11.3',
      locale: 'yo-NG',
      properties: { attempts: 1, delivery_delay_band: 'under_30s' },
    });
  });

  it('envelopes account_registered with the same subject and the taxonomy properties', async () => {
    const store = sink();
    await adapterFor(store).adapter.emit(ACCOUNT_REGISTERED);

    expect(store.emitted).toHaveLength(1);
    expect(store.emitted[0]).toMatchObject({
      event_name: 'account_registered',
      user_id: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
      anonymous_id: null,
      locale: 'yo-NG',
      properties: {
        identity_state: 'registered',
        verification_method: 'self_code',
        shared_number: false,
        ward_resolved: false,
        locale: 'yo-NG',
      },
    });
  });

  it('attributes a pre-account event to the anonymous id and to no member', async () => {
    const store = sink();
    await adapterFor(store).adapter.emit({
      name: 'registration_started',
      properties: { locale: 'en-NG' },
      subject: { kind: 'anonymous', anonymousId: 'prg_01J9Z4P8R2T6V8W1X3Y5Z7AB9' },
    });

    expect(store.emitted).toHaveLength(1);
    expect(store.emitted[0]).toMatchObject({
      event_name: 'registration_started',
      user_id: null,
      // `EVT-042`: no account exists yet, so the pending registration is the subject.
      anonymous_id: 'prg_01J9Z4P8R2T6V8W1X3Y5Z7AB9',
      // The event carries no locale of its own, so the payload's own property decides.
      locale: 'en-NG',
      properties: { locale: 'en-NG' },
    });
  });

  it('files an event with no locale of its own under the deployment default', async () => {
    const store = sink();
    const { locale, ...withoutLocale } = NUMBER_CONFIRMED;
    await adapterFor(store).adapter.emit(withoutLocale);

    expect(locale).toBe('yo-NG');
    expect(store.emitted[0]?.locale).toBe('en-NG');
    expect(store.emitted[0]?.properties).toEqual(NUMBER_CONFIRMED.properties);
  });

  it('never copies the member session token into the envelope', async () => {
    const store = sink();
    const tokens = identifiers();
    await adapterFor(store, { identifiers: tokens }).adapter.emit(NUMBER_CONFIRMED);

    // One identifier for the event's session, one for its own id, both opaque `ses_`/`evt_` values.
    expect(tokens.calls).toEqual(['ses', 'evt']);
    expect(store.emitted[0]?.session_id).toMatch(/^ses_[0-9A-Z]{4,26}$/);
  });

  it('refuses an identity it cannot name, and reports it instead of sending', async () => {
    const store = sink();
    const { adapter, report } = adapterFor(store);

    await adapter.emit({
      ...ACCOUNT_REGISTERED,
      subject: { kind: 'member', memberId: 'Oluwaseun Adeyemi' },
    });

    expect(store.emitted).toEqual([]);
    expect(report.reported).toEqual([
      {
        kind: 'REJECTED',
        code: 'VALIDATION_FAILED',
        cause: 'EVENT_ENVELOPE_INVALID',
        fields: { user_id: 'PATTERN_MISMATCH' },
      },
    ]);
  });

  it('buffers against an unreachable store and never fails the write that produced the event', async () => {
    const store = sink({ fails: true });
    const { adapter, report, buffer } = adapterFor(store);

    await expect(adapter.emit(NUMBER_CONFIRMED)).resolves.toBeUndefined();

    expect(store.emitted).toEqual([]);
    expect(buffer.size()).toBe(1);
    expect(report.reported).toEqual([
      { kind: 'NOT_STORED', eventId: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z02', cause: 'ANALYTICS_STORE_UNAVAILABLE' },
    ]);
  });
});
