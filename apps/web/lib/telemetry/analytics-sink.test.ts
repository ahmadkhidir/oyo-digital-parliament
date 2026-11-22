/**
 * The durable sink seam (`C-089`, `C-077` operation `analytics.emit`).
 *
 * The store itself is proved against PostgreSQL in `packages/db` (`analytics-event.repository.test`).
 * These tests prove what this deployable adds: the dispatcher sees a stored outcome, the envelope is
 * unchanged on the way through, and a store refusal is reported as a queued event rather than thrown
 * into the write that produced it.
 */
import { describe, expect, it } from 'vitest';
import type { AnalyticsEmitRequest, AnalyticsStorePort } from '@odp/domain';

import { createDurableAnalyticsSink } from './analytics-sink';
import { createTelemetryDispatcher, type TelemetryFailure } from './dispatcher';

/** A store that keeps what it was given, and can refuse on demand. */
function store(options: { fails?: boolean } = {}) {
  const stored: AnalyticsEmitRequest[] = [];
  const port: AnalyticsStorePort = {
    async emit(request) {
      if (options.fails === true) throw new Error('ANALYTICS_STORE_UNAVAILABLE');
      stored.push(request);
      return { storedAt: '2026-11-25T12:00:01Z' };
    },
    async replaceUserToken() {
      return { replaced: 0 };
    },
  };
  return { port, stored };
}

/** An identifier source that counts, so one event id is minted per event. */
function identifiers() {
  let sequence = 0;
  return {
    next(prefix: string) {
      sequence += 1;
      return `${prefix}_01J9ZQ1R3S5T7V9W1X3Y5Z${String(sequence).padStart(2, '0')}`;
    },
  };
}

/** A dispatcher over the durable sink, for the registered member who confirms a code (`EVT-003`). */
function dispatcherFor(
  port: AnalyticsStorePort,
  reporter?: { readonly report: (failure: TelemetryFailure) => void },
) {
  return createTelemetryDispatcher({
    context: {
      sessionId: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
      userId: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
      anonymousId: null,
      locale: 'en-NG',
    },
    sink: createDurableAnalyticsSink(port),
    clock: { now: () => new Date('2026-11-25T12:00:00.000Z') },
    identifiers: identifiers(),
    appVersion: '2026.11.3',
    ...(reporter === undefined ? {} : { reporter }),
  });
}

describe('durable analytics sink', () => {
  it('stores a validated identity event and reports the instant it was stored', async () => {
    const { port, stored } = store();

    const outcome = await dispatcherFor(port).emit('number_confirmed', {
      attempts: 1,
      delivery_delay_band: 'under_30s',
    });

    expect(outcome).toEqual({
      status: 'accepted',
      eventId: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z01',
      storedAt: '2026-11-25T12:00:01Z',
    });
    expect(stored).toEqual([
      {
        event_name: 'number_confirmed',
        event_id: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z01',
        occurred_at: '2026-11-25T12:00:00Z',
        user_id: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
        anonymous_id: null,
        session_id: 'ses_01J9ZQ2S4T6V8W1X3Y5Z7AB',
        platform: 'web',
        app_version: '2026.11.3',
        locale: 'en-NG',
        properties: { attempts: 1, delivery_delay_band: 'under_30s' },
      },
    ]);
  });

  it('queues and reports the event when the store refuses instead of failing the caller', async () => {
    const { port } = store({ fails: true });
    const failures: TelemetryFailure[] = [];

    const dispatcher = dispatcherFor(port, {
      report: (failure) => failures.push(failure),
    });
    const outcome = await dispatcher.emit('account_registered', {
      identity_state: 'registered',
      verification_method: 'self_code',
      ward_resolved: false,
      locale: 'en-NG',
    });

    expect(outcome.status).toBe('queued');
    expect(dispatcher.pending()).toBe(1);
    expect(failures).toEqual([
      {
        kind: 'NOT_STORED',
        eventId: 'evt_01J9ZQ1R3S5T7V9W1X3Y5Z01',
        cause: 'ANALYTICS_STORE_UNAVAILABLE',
      },
    ]);
  });
});
