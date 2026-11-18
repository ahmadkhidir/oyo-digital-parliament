/**
 * The retry buffer behind the telemetry dispatcher (`C-089`: "the event is buffered and retried, and
 * the originating write is not failed, because analytics is a low-criticality path").
 *
 * The buffer is a bounded FIFO. When it is full the oldest event is dropped and the drop is reported,
 * because a store that has been unreachable long enough to fill the buffer is a store whose recent
 * events still describe the current funnel and whose oldest events describe a period already behind
 * the campaign.
 *
 * Duplicate `event_id`s collapse into one entry, so a retried flush cannot double-count a screen view
 * or a published submission.
 */
import type { AnalyticsEmitRequest } from '@odp/domain';

/** What the dispatcher does with a full buffer: keep the newest, report the loss. */
export const DEFAULT_BUFFER_CAPACITY = 200;

/** A bounded, de-duplicating queue of events that the store did not take. */
export interface TelemetryBuffer {
  /**
   * Adds one event.
   *
   * @returns whether it was kept, and the event displaced when the buffer was full.
   */
  enqueue(request: AnalyticsEmitRequest): { readonly kept: boolean; readonly dropped?: AnalyticsEmitRequest };

  /** Removes and returns everything queued, oldest first. */
  drain(): AnalyticsEmitRequest[];

  /** Puts events back at the head, in order, after a partially failed flush. */
  restore(requests: readonly AnalyticsEmitRequest[]): void;

  /** How many events are waiting. */
  size(): number;
}

/** Creates an in-process buffer. One per dispatcher; the worker may substitute a durable one. */
export function createTelemetryBuffer(capacity: number = DEFAULT_BUFFER_CAPACITY): TelemetryBuffer {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('The telemetry buffer needs a capacity of at least one event.');
  }
  let queue: AnalyticsEmitRequest[] = [];

  return {
    enqueue(request) {
      if (queue.some((queued) => queued.event_id === request.event_id)) {
        return { kept: false };
      }
      if (queue.length >= capacity) {
        const dropped = queue.shift();
        queue.push(request);
        return dropped === undefined ? { kept: true } : { kept: true, dropped };
      }
      queue.push(request);
      return { kept: true };
    },

    drain() {
      const drained = queue;
      queue = [];
      return drained;
    },

    restore(requests) {
      const known = new Set(requests.map((request) => request.event_id));
      const retained = queue.filter((queued) => !known.has(queued.event_id));
      queue = [...requests, ...retained].slice(0, capacity);
    },

    size() {
      return queue.length;
    },
  };
}
