/**
 * Telemetry dispatch for `apps/web` (`C-089`, `analytics.md`).
 *
 * Import the dispatcher from here and nowhere else. A route that builds its own payload, or posts one
 * to a third party, is a route whose event will drift from the taxonomy.
 */
export {
  createTelemetryDispatcher,
  type TelemetryContext,
  type TelemetryDispatcher,
  type TelemetryDispatcherOptions,
  type TelemetryFailure,
  type TelemetryOutcome,
  type TelemetryReporter,
  type TelemetrySink,
} from './dispatcher';
export {
  DEFAULT_BUFFER_CAPACITY,
  createTelemetryBuffer,
  type TelemetryBuffer,
} from './buffer';
