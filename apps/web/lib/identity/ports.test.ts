/**
 * The identity analytics adapter: every identity event leaves with a subject, a schema-valid envelope
 * and no personal field (`C-089`, `EVT-003`, `EVT-004`, `EVT-042`).
 *
 * The domain's own tests prove that the use cases name the subject. These tests prove what the
 * deployable does with it: `user_id` or `anonymous_id` and never both, the locale the resident is
 * reading, no token from the session cookie, and a refusal that is reported rather than silently
 * dropped.
 *
 * The second half is the registration boundary (`C-002`, `C-076`): the code leaves through the
 * notification boundary's queue and reaches the SMS double, a hold answers `delayed` and leaves the
 * message queued, and a replay under one dedupe key sends nothing twice.
 */
import { describe, expect, it } from 'vitest';
import type {
  AnalyticsEmitRequest,
  IdentityAnalyticsEvent,
  OutboundNotification,
  OutboundQueuePort,
} from '@odp/domain';
import { createFakeSms } from '@odp/platform/testing';

import { createTelemetryBuffer } from '../telemetry';
import {
  createIdentityAnalytics,
  createRegistrationNotification,
  type IdentityAnalyticsOptions,
} from './ports';

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
function adapterFor(store: ReturnType<typeof sink>, extra: Partial<IdentityAnalyticsOptions> = {}) {
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
      {
        kind: 'NOT_STORED',
        eventId: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z02',
        cause: 'ANALYTICS_STORE_UNAVAILABLE',
      },
    ]);
  });
});

/** The instant the boundary's clock reports. */
const BOUNDARY_NOW = '2026-11-18T09:14:00Z';

/** A pending registration identifier in the form `C-001` fixes. */
const PENDING_ID = 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9';

/** A destination that only the send may see. */
const DESTINATION = '+2348031234567';

/** The body the code store would render; the digits stand in for the real ones. */
const CODE_BODY = 'Your Oyo Digital Parliament code is 418302.';

/**
 * A minimal outbound queue that keeps `C-076`'s two guarantees.
 *
 * One row per dedupe key, and a claim only the lease holder may record, so a replay of the dispatch
 * finds the row already owned or already terminal and sends nothing a second time.
 */
function queueDouble() {
  const rows = new Map<string, OutboundNotification>();
  const leaseTokens = new Map<string, string>();
  let sequence = 0;

  const port: OutboundQueuePort = {
    async enqueue(record) {
      const existing = [...rows.values()].find((row) => row.dedupeKey === record.dedupeKey);
      if (existing !== undefined) return { record: existing, created: false };
      rows.set(record.id, record);
      return { record, created: true };
    },
    async findById(notificationId) {
      return rows.get(notificationId) ?? null;
    },
    async findByDedupeKey(dedupeKey) {
      return [...rows.values()].find((row) => row.dedupeKey === dedupeKey) ?? null;
    },
    async claimById({ notificationId }) {
      const row = rows.get(notificationId);
      if (row === undefined || row.state !== 'queued') return null;
      if (leaseTokens.has(notificationId)) return null;
      sequence += 1;
      const leaseToken = `lea_${String(sequence).padStart(4, '0')}`;
      leaseTokens.set(notificationId, leaseToken);
      return { record: row, leaseToken };
    },
    async claimDue() {
      return [];
    },
    async recordAttempt({ notificationId, leaseToken, attempt }) {
      if (leaseTokens.get(notificationId) !== leaseToken) return null;
      const row = rows.get(notificationId);
      if (row === undefined) return null;
      leaseTokens.delete(notificationId);
      const updated: OutboundNotification = {
        ...row,
        state: attempt.state,
        attempts: attempt.attempts,
        nextAttemptAt: attempt.nextAttemptAt ?? row.nextAttemptAt,
        lastAttemptAt: attempt.at,
        lastOutcome: attempt.outcome,
        messageRef: attempt.messageRef,
        ...(attempt.cause === null ? {} : { lastCause: attempt.cause }),
        ...(attempt.state === 'sent' ? { sentAt: attempt.at } : {}),
        ...(attempt.state === 'failed' ? { failedAt: attempt.at } : {}),
      };
      rows.set(notificationId, updated);
      return updated;
    },
    async listHeld() {
      return { rows: [], nextCursor: null };
    },
  };

  return { port, rows };
}

/** The boundary with the SMS double, a queue that keeps its claim rule, and no database. */
function boundary(options: { readonly ttlSeconds?: number } = {}) {
  const sms = createFakeSms();
  const queue = queueDouble();
  let sequence = 0;
  const deliverCode = createRegistrationNotification({
    queue: queue.port,
    recipients: {
      async resolve() {
        return { locale: 'en-NG', smsDestination: DESTINATION };
      },
    },
    bodies: {
      async render({ record }) {
        return record.template === 'registration_code' ? CODE_BODY : null;
      },
    },
    sms,
    clock: { now: () => new Date(BOUNDARY_NOW) },
    identifiers: {
      next: (prefix) => {
        sequence += 1;
        return `${prefix}_01J9ZN1P3Q5R7S9T1V3W${String(sequence).padStart(2, '0')}`;
      },
    },
    codeTtlSeconds: options.ttlSeconds ?? 10 * 60,
  });
  return { sms, rows: queue.rows, deliverCode };
}

describe('registration code delivery (C-002, C-076)', () => {
  it('queues the code and sends the body through the SMS port', async () => {
    const { sms, rows, deliverCode } = boundary();

    const delivery = await deliverCode.deliverCode({
      pendingRegistrationId: PENDING_ID,
      locale: 'en-NG',
      dedupeKey: `registration_code:${PENDING_ID}:${BOUNDARY_NOW}`,
    });

    expect(delivery).toEqual({ status: 'sent', channel: 'sms' });
    expect(sms.sent).toHaveLength(1);
    expect(sms.sent[0]?.destination).toBe(DESTINATION);
    expect(sms.sent[0]?.body).toBe(CODE_BODY);

    // The queue holds the target and the window, never the digits or a rendered body (`C-076`).
    const [row] = [...rows.values()];
    expect(row).toMatchObject({ channel: 'sms', template: 'registration_code', state: 'sent' });
    expect(row?.payload).toEqual({ targetId: PENDING_ID, expiresInMinutes: '10' });
    expect(JSON.stringify(row)).not.toContain(DESTINATION);
    expect(JSON.stringify(row)).not.toContain(CODE_BODY);
  });

  it('answers delayed and keeps the message queued when the gateway holds it', async () => {
    const { sms, rows, deliverCode } = boundary();
    sms.queue({ outcome: 'held', messageRef: null, cause: 'PROVIDER_UNAVAILABLE' });

    const delivery = await deliverCode.deliverCode({
      pendingRegistrationId: PENDING_ID,
      locale: 'en-NG',
      dedupeKey: `registration_code:${PENDING_ID}:${BOUNDARY_NOW}`,
    });

    expect(delivery).toEqual({ status: 'delayed', channel: 'sms' });
    expect(sms.sent).toHaveLength(1);
    // Held, not lost: the row is still queued with a next attempt (`C-076`).
    const [row] = [...rows.values()];
    expect(row).toMatchObject({ state: 'queued', attempts: 1, lastOutcome: 'held' });
    expect(row?.nextAttemptAt).toBeDefined();
  });

  it('answers delayed rather than failing the write when the queue is unreachable', async () => {
    const sms = createFakeSms();
    const unreachable = createRegistrationNotification({
      queue: {
        ...queueDouble().port,
        async enqueue() {
          throw new Error('the queue is unreachable');
        },
      },
      recipients: {
        async resolve() {
          return { locale: 'en-NG', smsDestination: DESTINATION };
        },
      },
      bodies: {
        async render() {
          return CODE_BODY;
        },
      },
      sms,
      clock: { now: () => new Date(BOUNDARY_NOW) },
      identifiers: { next: (prefix) => `${prefix}_01J9ZN1P3Q5R7S9T1V3W01` },
      codeTtlSeconds: 600,
    });

    await expect(
      unreachable.deliverCode({
        pendingRegistrationId: PENDING_ID,
        locale: 'en-NG',
        dedupeKey: `registration_code:${PENDING_ID}:${BOUNDARY_NOW}`,
      }),
    ).resolves.toEqual({ status: 'delayed', channel: 'sms' });
    expect(sms.sent).toEqual([]);
  });

  it('sends once for one dedupe key, however often the dispatch is replayed', async () => {
    const { sms, deliverCode } = boundary();
    const input = {
      pendingRegistrationId: PENDING_ID,
      locale: 'en-NG' as const,
      dedupeKey: `registration_code:${PENDING_ID}:${BOUNDARY_NOW}`,
    };

    const first = await deliverCode.deliverCode(input);
    const replay = await deliverCode.deliverCode(input);

    expect(first).toEqual({ status: 'sent', channel: 'sms' });
    expect(replay).toEqual({ status: 'sent', channel: 'sms' });
    expect(sms.sent).toHaveLength(1);
  });
});
