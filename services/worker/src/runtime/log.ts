/**
 * Structured operational logging for the worker (`architecture.md` Logging & Monitoring,
 * `services/worker/AGENTS.md` Discipline: "Observability carries counts, never content").
 *
 * One JSON object per line, with a timestamp, a level, the event name, the job or run identifier and a
 * redacted context object. The worker logs counts, durations, outcomes and identifiers it minted; it
 * never logs a member's name, telephone number, identifier, ward description, submission text or a
 * model payload.
 *
 * A failed write is swallowed. A log pipeline being unavailable must not fail a scheduled obligation
 * or prevent a batch from releasing its lock.
 */
import { randomBytes } from 'node:crypto';

/** Severity levels a log line can carry. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured fields attached to an event. Values are redacted before serialisation. */
export type LogContext = Record<string, unknown>;

/** Where a serialised line goes. */
export interface LogSink {
  write(line: string, level: LogLevel): void;
}

/** The worker's logger. */
export interface Logger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  /** Returns a logger that attaches the same fields to every line. */
  child(bindings: LogContext): Logger;
}

/** What the logger needs, injectable for a test. */
export interface LoggerOptions {
  readonly service?: string;
  readonly sink?: LogSink;
  readonly clock?: { now(): Date };
}

/** The constant written in place of a redacted value. */
export const REDACTED = '[redacted]';

const SENSITIVE_KEYS = new Set([
  'name',
  'fullname',
  'firstname',
  'lastname',
  'displayname',
  'membername',
  'username',
  'wardname',
  'warddescription',
  'telephone',
  'telephonenumber',
  'phonenumber',
  'phone',
  'msisdn',
  'email',
  'emailaddress',
  'memberid',
  'userid',
  'sessionid',
  'subjectid',
  'submission',
  'submissiontext',
  'comment',
  'commenttext',
  'freetext',
  'content',
  'text',
  'reason',
  'authorization',
  'cookie',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'password',
  'pin',
  'otp',
  'credential',
  'apikey',
  'databaseurl',
  'connectionstring',
  'dsn',
]);

const SENSITIVE_SUFFIXES = [
  'fullname',
  'firstname',
  'lastname',
  'displayname',
  'membername',
  'wardname',
  'telephonenumber',
  'phonenumber',
  'memberid',
  'userid',
  'sessionid',
];

const VALUE_PATTERNS = [
  /(?<!\d)(?:\+234|0)[\s-]?[789](?:[\s-]?\d){9}(?!\d)/g,
  /\+\d{1,3}[\s-]?\d{6,14}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b(?:mbr|stf|usr|per|tok|ses)_[0-9A-Z]{4,26}\b/g,
  /\bBearer\s+[A-Z0-9._~+/-]+=*/gi,
  /\beyJ[A-Z0-9_-]+\.[A-Z0-9_-]+\.[A-Z0-9_-]+\b/gi,
];

const MAX_STRING = 2048;
const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_KEYS = 100;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function normaliseKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalised = normaliseKey(key);
  return (
    SENSITIVE_KEYS.has(normalised) ||
    SENSITIVE_SUFFIXES.some((suffix) => normalised.endsWith(suffix))
  );
}

/** Removes values that look like personal data from a free-text string. */
export function redactText(text: string): string {
  let redacted = text;
  for (const pattern of VALUE_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted.slice(0, MAX_STRING);
}

function redactError(error: Error): Record<string, unknown> {
  const record: Record<string, unknown> = { name: error.name };
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === 'string' || typeof code === 'number') record['code'] = code;
  return record;
}

/** Recursively redacts a value before it is serialised. */
export function redactLogValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[truncated]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return undefined;
  }
  if (value instanceof Error) return redactError(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? REDACTED : value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => redactLogValue(entry, depth + 1));
  }

  const output: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (kept >= MAX_KEYS) break;
    kept += 1;
    output[key] = isSensitiveKey(key) ? REDACTED : redactLogValue(entry, depth + 1);
  }
  return output;
}

/** Redacts a whole context object. */
export function redactLogContext(context: LogContext): Record<string, unknown> {
  const redacted = redactLogValue(context);
  return redacted !== null && typeof redacted === 'object' && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {};
}

/**
 * Generates a correlation identifier in the `C-001` form.
 *
 * The worker is the origin of a scheduled tick rather than the receiver of a browser request, but the
 * same identifier lets an operator join a log line to a run and to the events the run emitted.
 */
export function newCorrelationId(): string {
  const bytes = randomBytes(26);
  let body = '';
  for (const byte of bytes) {
    body += CROCKFORD[byte & 31] ?? '0';
  }
  return `req_${body}`;
}

/** The production sink: info to stdout, warnings and errors to stderr. */
export function createProcessSink(
  streams: {
    readonly out: { write(chunk: string): boolean };
    readonly err: { write(chunk: string): boolean };
  } = {
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
 * Creates a JSON logger for the worker.
 *
 * @param options - The service name, sink and clock.
 */
export function createJsonLogger(options: LoggerOptions = {}): Logger {
  const service = options.service ?? 'worker';
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
      service,
      event,
    };
    if (typeof correlation === 'string') record['correlationId'] = redactText(correlation);
    record['context'] = redactLogContext(merged);

    try {
      sink.write(JSON.stringify(record), level);
    } catch {
      // See the module docstring: a diagnostic write never fails the obligation.
    }
  };

  const make = (bindings: LogContext): Logger => ({
    debug: (event, context) => write('debug', event, bindings, context),
    info: (event, context) => write('info', event, bindings, context),
    warn: (event, context) => write('warn', event, bindings, context),
    error: (event, context) => write('error', event, bindings, context),
    child: (more) => make({ ...bindings, ...more }),
  });

  return make({});
}
