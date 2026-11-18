/**
 * The structured operational logger (`architecture.md` Logging & Monitoring).
 *
 * Every line is one JSON object written to stdout (debug, info) or stderr (warn, error), so the
 * hosting platform can index it without a parser in the request path. A line carries the service, the
 * event name, a timestamp, an optional correlation identifier and a redacted context object. It never
 * carries a request body, a query string, a cookie or an identity.
 *
 * Logging is allowed to fail without failing the caller: a sink that throws is swallowed, because an
 * operator's log pipeline being unavailable must not turn a successful request into an error.
 */
import { redactLogContext, redactText } from './redact';

/** Severity levels a log line can carry. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured fields attached to an event. Values are redacted before serialisation. */
export type LogContext = Record<string, unknown>;

/** Where a serialised line goes. */
export interface LogSink {
  /** @param line - One JSON object, without the trailing newline. */
  write(line: string, level: LogLevel): void;
}

/** The logger every area and route uses. */
export interface Logger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  /** Returns a logger that attaches the same fields to every line. */
  child(bindings: LogContext): Logger;
}

/** What the logger needs, all injectable so a test never writes to a real stream. */
export interface LoggerOptions {
  /** `web` or `worker`, so one index can tell the two processes apart. */
  readonly service: string;
  /** Where lines go. Defaults to the process streams. */
  readonly sink?: LogSink;
  /** The clock, so a test can assert the timestamp. */
  readonly clock?: { now(): Date };
}

/** The subset of a writable stream the default sink needs. */
interface WritableLike {
  write(chunk: string): boolean;
}

/**
 * The production sink: info to stdout, warnings and errors to stderr.
 *
 * Container platforms collect both, and separating them lets an operator filter to failures without
 * parsing every level.
 */
export function createProcessSink(
  streams: { readonly out: WritableLike; readonly err: WritableLike } = {
    out: process.stdout,
    err: process.stderr,
  },
): LogSink {
  return {
    write(line, level) {
      const stream = level === 'warn' || level === 'error' ? streams.err : streams.out;
      stream.write(`${line}\n`);
    },
  };
}

/**
 * Creates a JSON logger.
 *
 * @param options - The service name, an optional sink and an optional clock.
 * @returns A logger whose every method is safe to call from a request path.
 */
export function createJsonLogger(options: LoggerOptions): Logger {
  const sink = options.sink ?? createProcessSink();
  const clock = options.clock ?? { now: () => new Date() };

  const write = (
    level: LogLevel,
    event: string,
    bindings: LogContext,
    context?: LogContext,
  ): void => {
    const merged: LogContext = { ...bindings, ...context };
    const correlation = merged['correlationId'];
    delete merged['correlationId'];

    const record: Record<string, unknown> = {
      time: clock.now().toISOString(),
      level,
      service: options.service,
      event,
    };
    if (typeof correlation === 'string') record['correlationId'] = redactText(correlation);
    record['context'] = redactLogContext(merged);

    try {
      sink.write(JSON.stringify(record), level);
    } catch {
      // The sink is a diagnostic path. A failed write is reported nowhere further without risking a
      // second failure and must never reach the request that produced the line.
    }
  };

  const make = (bindings: LogContext): Logger => ({
    debug: (event, context) => write('debug', event, bindings, context),
    info: (event, context) => write('info', event, bindings, context),
    warn: (event, context) => write('warn', event, bindings, context),
    error: (event, context) => write('error', event, bindings, context),
    child: (more) => make({ ...bindings, ...more }),
  });

  const logger = make({});
  return logger;
}
