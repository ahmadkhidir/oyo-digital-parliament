/**
 * The telemetry dispatcher: a closed vocabulary, a pseudonymous identity, and a failure that never
 * reaches the originating write (`C-089`, `EVT-001` as the smoke event, `NFR-040`).
 */
import { describe, expect, it, vi } from 'vitest';
import type { AnalyticsEmitRequest } from '@odp/domain';

import { createTelemetryBuffer } from './buffer';
import { createTelemetryDispatcher, type TelemetryFailure } from './dispatcher';

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

/** A sink that records every event it was given, and fails on demand. */
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

/** Collects what the dispatcher reported. */
function reporter() {
  const failures: TelemetryFailure[] = [];
  return { failures, report: (failure: TelemetryFailure) => failures.push(failure) };
}

/** The member's context: registered, Yoruba, one session. */
const context = {
  sessionId: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
  userId: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
  anonymousId: null,
  locale: 'yo-NG' as const,
};

/** A dispatcher over the given effects. */
function dispatcherFor(
  store: ReturnType<typeof sink>,
  extra: { reporter?: ReturnType<typeof reporter>; buffer?: ReturnType<typeof createTelemetryBuffer> } = {},
) {
  return createTelemetryDispatcher({
    context,
    sink: store,
    clock,
    identifiers: identifiers(),
    appVersion: '2026.11.3',
    ...extra,
  });
}

describe('telemetry dispatcher', () => {
  it('sends a valid event with a pseudonymous identity and no personal field', async () => {
    const store = sink();
    const outcome = await dispatcherFor(store).emit('screen_viewed', {
      screen: 'home',
      device_class: 'mobile',
      signed_in: true,
    });

    expect(outcome).toMatchObject({ status: 'accepted', storedAt: '2026-11-25T12:00:01Z' });
    expect(store.emitted).toHaveLength(1);
    const sent = store.emitted[0];
    expect(sent).toMatchObject({
      event_name: 'screen_viewed',
      occurred_at: '2026-11-25T12:00:00Z',
      session_id: context.sessionId,
      user_id: context.userId,
      anonymous_id: null,
      platform: 'web',
      app_version: '2026.11.3',
      locale: 'yo-NG',
    });
    expect(JSON.stringify(sent)).not.toMatch(/Oluwaseun|0803|telephone|fullName/i);
  });

  it('mints one event id per event', async () => {
    const store = sink();
    const dispatcher = dispatcherFor(store);
    await dispatcher.emit('screen_viewed', { screen: 'home', device_class: 'mobile', signed_in: true });
    await dispatcher.emit('screen_viewed', { screen: 'submit', device_class: 'mobile', signed_in: true });
    const ids = store.emitted.map((event) => event.event_id);
    expect(new Set(ids).size).toBe(2);
  });

  it('queues the event when the store is down, reports it, and never fails the caller', async () => {
    const reports = reporter();
    const dispatcher = dispatcherFor(sink({ fails: true }), { reporter: reports });

    const outcome = await dispatcher.emit('screen_viewed', {
      screen: 'home',
      device_class: 'mobile',
      signed_in: true,
    });

    expect(outcome.status).toBe('queued');
    expect(dispatcher.pending()).toBe(1);
    expect(reports.failures).toEqual([
      expect.objectContaining({ kind: 'NOT_STORED', cause: 'ANALYTICS_STORE_UNAVAILABLE' }),
    ]);
  });

  it('replays the queue in order once the store takes events again', async () => {
    let available = false;
    const delivered: string[] = [];
    const dispatcher = createTelemetryDispatcher({
      context,
      sink: {
        async emit(request) {
          if (!available) throw new Error('analytics unavailable');
          delivered.push((request.properties as { screen: string }).screen);
          return { storedAt: '2026-11-25T12:00:01Z' };
        },
      },
      clock,
      identifiers: identifiers(),
      appVersion: '2026.11.3',
    });

    await dispatcher.emit('screen_viewed', { screen: 'home', device_class: 'mobile', signed_in: true });
    await dispatcher.emit('screen_viewed', { screen: 'submit', device_class: 'mobile', signed_in: true });
    expect(dispatcher.pending()).toBe(2);

    available = true;
    await dispatcher.flush();
    expect(dispatcher.pending()).toBe(0);
    expect(delivered).toEqual(['home', 'submit']);
  });

  it('keeps the tail of a partially failed flush rather than losing order', async () => {
    let down = true;
    let flushCalls = 0;
    const delivered: string[] = [];
    const dispatcher = createTelemetryDispatcher({
      context,
      sink: {
        async emit(request) {
          if (down) throw new Error('analytics unavailable');
          flushCalls += 1;
          // The store takes the first event of the flush and refuses the second.
          if (flushCalls === 2) throw new Error('analytics unavailable');
          delivered.push((request.properties as { screen: string }).screen);
          return { storedAt: '2026-11-25T12:00:01Z' };
        },
      },
      clock,
      identifiers: identifiers(),
      appVersion: '2026.11.3',
    });

    await dispatcher.emit('screen_viewed', { screen: 'home', device_class: 'mobile', signed_in: true });
    await dispatcher.emit('screen_viewed', { screen: 'submit', device_class: 'mobile', signed_in: true });
    expect(dispatcher.pending()).toBe(2);

    down = false;
    await dispatcher.flush();
    expect(delivered).toEqual(['home']);
    expect(dispatcher.pending()).toBe(1);

    await dispatcher.flush();
    expect(dispatcher.pending()).toBe(0);
    expect(delivered).toEqual(['home', 'submit']);
  });

  it('reports an event the taxonomy refuses instead of sending or queueing it', async () => {
    const store = sink();
    const reports = reporter();
    const dispatcher = dispatcherFor(store, { reporter: reports });

    // A ward description reaches the dispatcher from an untyped call site: the envelope refuses it.
    const outcome = await dispatcher.emit('ward_sent_for_review', {
      lga_matched: true,
      ward_description: 'Bodija ward three near the market',
    } as never);

    expect(outcome).toEqual({ status: 'rejected', cause: 'PERSONAL_DATA_IN_EVENT' });
    expect(store.emitted).toHaveLength(0);
    expect(dispatcher.pending()).toBe(0);
    expect(reports.failures).toEqual([
      expect.objectContaining({ kind: 'REJECTED', code: 'POLICY_VIOLATION', cause: 'PERSONAL_DATA_IN_EVENT' }),
    ]);
  });

  it('survives a reporter that throws', async () => {
    const dispatcher = dispatcherFor(sink({ fails: true }), {
      reporter: {
        failures: [],
        report() {
          throw new Error('reporter broken');
        },
      },
    });
    await expect(
      dispatcher.emit('screen_viewed', { screen: 'home', device_class: 'mobile', signed_in: true }),
    ).resolves.toMatchObject({ status: 'queued' });
  });

  it('reports the event it had to drop when the buffer fills', async () => {
    const failures: TelemetryFailure[] = [];
    const dispatcher = createTelemetryDispatcher({
      context,
      sink: sink({ fails: true }),
      clock,
      identifiers: identifiers(),
      appVersion: '2026.11.3',
      buffer: createTelemetryBuffer(1),
      reporter: { report: (failure) => failures.push(failure) },
    });
    await dispatcher.emit('screen_viewed', { screen: 'home', device_class: 'mobile', signed_in: true });
    await dispatcher.emit('screen_viewed', { screen: 'submit', device_class: 'mobile', signed_in: true });
    expect(dispatcher.pending()).toBe(1);
    expect(failures.some((failure) => failure.kind === 'QUEUE_FULL')).toBe(true);
  });

  it('carries the correlation id a model event requires', async () => {
    const store = sink();
    const dispatcher = createTelemetryDispatcher({
      context: { ...context, correlationId: 'req_01J9Z6M2V4' },
      sink: store,
      clock,
      identifiers: identifiers(),
      appVersion: '2026.11.3',
    });
    const outcome = await dispatcher.emit('model_fallback_triggered', {
      capability: 'similar_submission',
      reason_code: 'TIMEOUT',
    });
    expect(outcome.status).toBe('accepted');
    expect(store.emitted[0]).toMatchObject({ correlation_id: 'req_01J9Z6M2V4' });
  });

  it('refuses a model event with no correlation rather than inventing one', async () => {
    const store = sink();
    const violations = vi.fn();
    const dispatcher = dispatcherFor(store, { reporter: { failures: [], report: violations } });
    const outcome = await dispatcher.emit('model_suggestion_accepted', {
      capability: 'ward_candidate',
      rank: 1,
    });
    expect(outcome).toEqual({ status: 'rejected', cause: 'EVENT_ENVELOPE_INVALID' });
    expect(store.emitted).toHaveLength(0);
    expect(violations).toHaveBeenCalledOnce();
  });
});
