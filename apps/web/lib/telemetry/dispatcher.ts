/**
 * The telemetry dispatcher (`C-089`, `analytics.md`, `apps/web/AGENTS.md` Discipline: "telemetry is a
 * closed vocabulary").
 *
 * Every route emits through this one function, and it cannot fail the request that called it. A
 * refusal from the taxonomy, an unreachable analytics store or a buffer that had to drop an event all
 * return an outcome, and the failure is reported to the operator's error reporter rather than thrown.
 * `C-089` is explicit that analytics is a low-criticality path: a resident's submission must not fail
 * because a screen view could not be counted.
 *
 * The envelope itself is built by `@odp/domain`, which owns the taxonomy, the common properties and
 * the no-personal-data rule. This layer supplies what only the request knows: the clock, the ids, the
 * session, the identity and the correlation.
 */
import {
  buildAnalyticsEvent,
  type AnalyticsEmitRequest,
  type AnalyticsEventName,
  type AnalyticsLocale,
  type AnalyticsPayloads,
  type FieldReason,
} from '@odp/domain';
import { createTelemetryBuffer, type TelemetryBuffer } from './buffer';

/** The analytics store, as this app reaches it. A rejection means the store did not take the event. */
export interface TelemetrySink {
  /** @throws when the event was not stored. */
  emit(request: AnalyticsEmitRequest): Promise<{ readonly storedAt: string }>;
}

/** Where a dispatcher failure goes. Never a log line carrying an event payload. */
export interface TelemetryReporter {
  report(failure: TelemetryFailure): void;
}

/** Why an event did not reach the analytics store. */
export type TelemetryFailure =
  | {
      readonly kind: 'REJECTED';
      readonly code: 'VALIDATION_FAILED' | 'POLICY_VIOLATION';
      readonly cause: string;
      readonly fields: Readonly<Record<string, FieldReason>>;
    }
  | { readonly kind: 'QUEUE_FULL'; readonly eventId: string; readonly droppedEventId: string }
  | { readonly kind: 'NOT_STORED'; readonly eventId: string; readonly cause: string };

/** What the caller learns. The originating write proceeds whatever this says. */
export type TelemetryOutcome =
  | { readonly status: 'accepted'; readonly eventId: string; readonly storedAt: string }
  | { readonly status: 'queued'; readonly eventId: string }
  | { readonly status: 'rejected'; readonly cause: string };

/** What the request knows about the person and the session that produced the event. */
export interface TelemetryContext {
  readonly sessionId: string;
  /** Pseudonymous member id; `null` before registration. */
  readonly userId: string | null;
  /** Pre-registration identifier; `null` once the member is registered. */
  readonly anonymousId: string | null;
  readonly locale: AnalyticsLocale;
  /** Ties the event to the request, and is required on a model event or a failure event. */
  readonly correlationId?: string;
}

/** Everything the dispatcher needs, plus the effects it must not perform itself. */
export interface TelemetryDispatcherOptions {
  readonly context: TelemetryContext;
  readonly sink: TelemetrySink;
  /** Injected so a test never waits on the wall clock. */
  readonly clock: { now(): Date };
  /** Injected so event ids and the app version come from one place. */
  readonly identifiers: { next(prefix: string): string };
  /** The release the app is running, as `C-089` sends it. */
  readonly appVersion: string;
  readonly buffer?: TelemetryBuffer;
  readonly reporter?: TelemetryReporter;
}

/** The dispatcher's surface. */
export interface TelemetryDispatcher {
  /** Validates, builds and sends one event. Never throws. */
  emit<K extends AnalyticsEventName>(
    name: K,
    properties: AnalyticsPayloads[K],
  ): Promise<TelemetryOutcome>;

  /** Retries what the buffer holds, oldest first. Never throws. */
  flush(): Promise<void>;

  /** How many events are waiting for a retry. */
  pending(): number;
}

/**
 * `C-001` formats timestamps as RFC 3339, UTC, to the second, with a `Z` suffix. `toISOString` adds
 * milliseconds, so they are trimmed rather than the whole value being rejected by the envelope.
 */
function toEnvelopeTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * Creates the dispatcher for one request or one job run.
 *
 * @param options - The request context, the sink, the clock, the id source and the release.
 */
export function createTelemetryDispatcher(options: TelemetryDispatcherOptions): TelemetryDispatcher {
  const buffer = options.buffer ?? createTelemetryBuffer();
  const report = (failure: TelemetryFailure): void => {
    try {
      options.reporter?.report(failure);
    } catch {
      // A failing reporter must not become the failure it was reporting.
    }
  };

  /** Sends one envelope, buffering it when the store refuses. Never throws. */
  const send = async (request: AnalyticsEmitRequest): Promise<TelemetryOutcome> => {
    try {
      const { storedAt } = await options.sink.emit(request);
      return { status: 'accepted', eventId: request.event_id, storedAt };
    } catch {
      const queued = buffer.enqueue(request);
      if (queued.dropped !== undefined) {
        report({ kind: 'QUEUE_FULL', eventId: request.event_id, droppedEventId: queued.dropped.event_id });
      }
      report({ kind: 'NOT_STORED', eventId: request.event_id, cause: 'ANALYTICS_STORE_UNAVAILABLE' });
      return { status: 'queued', eventId: request.event_id };
    }
  };

  return {
    async emit(name, properties) {
      const built = buildAnalyticsEvent({
        name,
        properties,
        eventId: options.identifiers.next('evt'),
        occurredAt: toEnvelopeTimestamp(options.clock.now()),
        sessionId: options.context.sessionId,
        userId: options.context.userId,
        anonymousId: options.context.anonymousId,
        appVersion: options.appVersion,
        locale: options.context.locale,
        ...(options.context.correlationId === undefined
          ? {}
          : { correlationId: options.context.correlationId }),
      });

      if (!built.ok) {
        // The event was misdesigned at the call site. Report it; do not queue it and do not throw.
        report({ kind: 'REJECTED', code: built.code, cause: built.cause, fields: built.fields });
        return { status: 'rejected', cause: built.cause };
      }
      return send(built.request);
    },

    async flush() {
      const pending = buffer.drain();
      for (const [index, request] of pending.entries()) {
        try {
          await options.sink.emit(request);
        } catch {
          // Keep this event and everything behind it, so the retried funnel stays in order.
          buffer.restore(pending.slice(index));
          return;
        }
      }
    },

    pending() {
      return buffer.size();
    },
  };
}
