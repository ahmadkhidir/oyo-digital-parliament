/**
 * Operational logging and probe primitives for the web deployable.
 *
 * The barrel is the module boundary: routes import from here, and the individual files stay free to
 * change. Redaction, correlation and serialisation live together because a caller that can build a log
 * line without the redactor is a caller that can leak one.
 */
export {
  CORRELATION_HEADER_NAME,
  CORRELATION_ID_PATTERN,
  CORRELATION_PATTERN_MISMATCH,
  correlationIdFrom,
  correlationRefusal,
  newCorrelationId,
  readCorrelationId,
  type CorrelationReading,
  type CorrelationRefusal,
} from './correlation';
export { createDatastoreCheck, DATASTORE_TIMEOUT_MS, type DatastoreCheck } from './datastore';
export {
  createDrainController,
  installShutdownHandlers,
  webDrain,
  type DrainController,
  type ShutdownInstallerOptions,
  type SignalSource,
} from './lifecycle';
export {
  createJsonLogger,
  createProcessSink,
  type LogContext,
  type LogLevel,
  type LogSink,
  type Logger,
  type LoggerOptions,
} from './logger';
export {
  createLivenessHandler,
  createReadinessHandler,
  PROBE_BODIES,
  refuseNonGetMethod,
  type ProbeHandler,
  type ProbeRuntime,
} from './probes';
export { createProbeAccessPolicy, type ProbeAccessPolicy } from './probe-access';
export { redactLogContext, redactLogValue, redactText, REDACTED } from './redact';
export { forRequest, type RequestLogger } from './request';
export { installWebShutdownHandlers, WEB_SHUTDOWN_GRACE_MS, webProbeRuntime } from './runtime';
