/**
 * The analytics envelope (`C-089`) and its run-time validation.
 *
 * One validation path serves both directions of the `analytics.emit` RPC: a server component builds
 * an event through {@link buildAnalyticsEvent}, which serialises to the wire shape and validates it,
 * and a component that receives the envelope validates it with `parseAnalyticsEmitRequest`. Callers
 * therefore cannot ship a payload that the receiving side would reject, because both run the same
 * checks over the same shape.
 *
 * Validation order is deliberate. Personal data is refused first, as `POLICY_VIOLATION` with
 * `PERSONAL_DATA_IN_EVENT`, because the event is wrong by design and must not be redacted into
 * respectability. Only then are the envelope's own fields and the taxonomy's declared properties
 * checked, which yields `VALIDATION_FAILED` with a `fields` map naming each bad path.
 */
import {
  type AnalyticsEventName,
  type AnalyticsLocale,
  type AnalyticsPayloads,
  analyticsEventDefinition,
} from './events.ts';
import type { AnalyticsPropertyKind } from './kinds.ts';
import { findPersonalDataFindings } from './personal-data.ts';

/**
 * A field-level reason token, from the frozen `C-001` set. The map is the contract's `fields` object:
 * a field path to a reason, never a sentence.
 */
export type FieldReason =
  | 'REQUIRED'
  | 'PATTERN_MISMATCH'
  | 'OUT_OF_BAND'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'ENUM_MISMATCH'
  | 'ALREADY_SET'
  | 'UNKNOWN_FIELD';

/** Which `C-001` code a refusal carries. */
export type AnalyticsFailureCode = 'VALIDATION_FAILED' | 'POLICY_VIOLATION';

/** A refused event. The originating write does not fail on this; the event is dropped and reported. */
export interface AnalyticsRejection {
  readonly ok: false;
  readonly code: AnalyticsFailureCode;
  /** Stable upper-snake token naming the reason, as `C-001` requires of every error. */
  readonly cause: string;
  /** A short operator-facing explanation. Never echoes a property value back. */
  readonly message: string;
  /** Field path to reason token. Empty when the refusal is not field-specific. */
  readonly fields: Readonly<Record<string, FieldReason>>;
}

/** The envelope as `C-089` sends it. */
export interface AnalyticsEmitRequest {
  readonly event_name: AnalyticsEventName;
  readonly event_id: string;
  readonly occurred_at: string;
  /** Pseudonymous member id, or `null` before registration. */
  readonly user_id: string | null;
  /** Pre-registration identifier, or `null` once the member is registered. */
  readonly anonymous_id: string | null;
  readonly session_id: string;
  readonly platform: 'web';
  readonly app_version: string;
  readonly locale: AnalyticsLocale;
  /** Present when the event is a model event or a failure. */
  readonly correlation_id?: string;
  readonly properties: Readonly<Record<string, string | number | boolean>>;
}

/** The outcome of building or parsing an event. */
export type AnalyticsEmitResult =
  { readonly ok: true; readonly request: AnalyticsEmitRequest } | AnalyticsRejection;

/**
 * Envelope field patterns.
 *
 * `C-001` reconciles the canonical identifier with the examples printed in the contract: a three-letter
 * prefix, an underscore, and an upper-case alphanumeric body of 4 to 26 characters. The boundary
 * enforces that reconciled form rather than the earlier fixed-length Crockford pattern.
 */
const EVENT_ID_PATTERN = /^evt_[0-9A-Z]{4,26}$/;
const SESSION_ID_PATTERN = /^ses_[0-9A-Z]{4,26}$/;
const USER_ID_PATTERN = /^usr_[0-9A-Z]{4,26}$/;
const ANONYMOUS_ID_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;
const CORRELATION_ID_PATTERN = /^req_[0-9A-Z]{4,32}$/;
const APP_VERSION_PATTERN = /^[0-9]{4}\.[0-9]{1,2}\.[0-9]+$/;
/** `C-001`: RFC 3339, UTC, second precision, suffix `Z`. */
const TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

/**
 * A stable code: lower-snake with `.`/`-` joins, or an upper-snake cause token. Both forms are closed
 * and neither admits whitespace, so a property declared as a token can never hold a sentence.
 */
const TOKEN_PATTERN = /^(?:[a-z0-9]+(?:[._-][a-z0-9]+)*|[A-Z0-9]+(?:_[A-Z0-9]+)*)$/;

/** The common properties `C-089` fixes, and no others. */
const COMMON_PROPERTY_KEYS = [
  'event_id',
  'occurred_at',
  'user_id',
  'anonymous_id',
  'session_id',
  'platform',
  'app_version',
  'locale',
] as const;

/** Envelope keys this boundary accepts: the event name, the common properties and the payload. */
const ENVELOPE_KEYS: readonly string[] = [
  'event_name',
  'correlation_id',
  'properties',
  ...COMMON_PROPERTY_KEYS,
];

/** A refusal that is not about one property. */
function refuse(
  code: AnalyticsFailureCode,
  cause: string,
  message: string,
  fields: Readonly<Record<string, FieldReason>> = {},
): AnalyticsRejection {
  return { ok: false, code, cause, message, fields };
}

/** Whether a value is a JSON scalar a property may hold. */
function isScalar(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** Whether a value is a plain object, as opposed to an array or `null`. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates one declared property against its kind.
 *
 * @returns the reason token, or `null` when the value is inside the declared domain.
 */
function checkKind(kind: AnalyticsPropertyKind, value: unknown): FieldReason | null {
  if (!isScalar(value)) return 'OUT_OF_BAND';
  switch (kind.type) {
    case 'boolean':
      return typeof value === 'boolean' ? null : 'OUT_OF_BAND';
    case 'integer':
      if (typeof value !== 'number' || !Number.isInteger(value)) return 'OUT_OF_BAND';
      if (value < kind.min) return 'OUT_OF_BAND';
      if (kind.max !== undefined && value > kind.max) return 'OUT_OF_BAND';
      return null;
    case 'enum':
      return typeof value === 'string' && kind.values.includes(value) ? null : 'ENUM_MISMATCH';
    case 'token':
      if (typeof value !== 'string') return 'OUT_OF_BAND';
      if (value.length === 0) return 'TOO_SHORT';
      if (value.length > kind.maxLength) return 'TOO_LONG';
      // A stable code: lower-snake (`named_allegation`, `odp-sim-2026-08-1`) or an upper-snake cause
      // (`COST_BAND_MISSING`) as `C-001` spells them. Mixed case is refused, so a person's name cannot
      // pass as a code.
      return TOKEN_PATTERN.test(value) ? null : 'PATTERN_MISMATCH';
    case 'identifier':
      if (typeof value !== 'string') return 'OUT_OF_BAND';
      return new RegExp(`^${kind.prefix}_[0-9A-Z]{4,26}$`).test(value) ? null : 'PATTERN_MISMATCH';
    case 'quarter':
      if (typeof value !== 'string') return 'OUT_OF_BAND';
      return /^[0-9]{4}-Q[1-4]$/.test(value) ? null : 'PATTERN_MISMATCH';
  }
}

/** Checks one optional string envelope field against a pattern. */
function checkPattern(
  raw: Readonly<Record<string, unknown>>,
  key: string,
  pattern: RegExp,
  fields: Record<string, FieldReason>,
): void {
  const value = raw[key];
  if (value === undefined) {
    fields[key] = 'REQUIRED';
    return;
  }
  if (typeof value !== 'string' || !pattern.test(value)) fields[key] = 'PATTERN_MISMATCH';
}

/**
 * Validates a wire envelope against `C-089`.
 *
 * @param raw - The candidate envelope, as it arrived.
 */
export function parseAnalyticsEmitRequest(raw: unknown): AnalyticsEmitResult {
  if (!isPlainObject(raw)) {
    return refuse(
      'VALIDATION_FAILED',
      'ENVELOPE_MALFORMED',
      'The analytics envelope is not an object.',
    );
  }

  const unknownEnvelopeKeys = Object.keys(raw).filter((key) => !ENVELOPE_KEYS.includes(key));
  if (unknownEnvelopeKeys.length > 0) {
    return refuse(
      'VALIDATION_FAILED',
      'ENVELOPE_FIELD_NOT_DECLARED',
      'The envelope carries a field the contract does not declare.',
      Object.fromEntries(unknownEnvelopeKeys.map((key) => [key, 'UNKNOWN_FIELD' as const])),
    );
  }

  const name = raw['event_name'];
  if (typeof name !== 'string' || name.length === 0) {
    return refuse('VALIDATION_FAILED', 'EVENT_NAME_REQUIRED', 'The envelope names no event.', {
      event_name: 'REQUIRED',
    });
  }
  const definition = analyticsEventDefinition(name);
  if (definition === undefined) {
    return refuse(
      'VALIDATION_FAILED',
      'UNKNOWN_EVENT_NAME',
      'The event name is not one of the names the taxonomy declares.',
      { event_name: 'ENUM_MISMATCH' },
    );
  }

  // Personal data is refused before anything else is read, so the event is never partially accepted.
  const rawProperties = raw['properties'];
  if (!isPlainObject(rawProperties)) {
    return refuse(
      'VALIDATION_FAILED',
      'PROPERTIES_REQUIRED',
      'The event carries no property object.',
      {
        properties: rawProperties === undefined ? 'REQUIRED' : 'OUT_OF_BAND',
      },
    );
  }
  const findings = findPersonalDataFindings(rawProperties);
  const policyFindings = findings.filter((finding) => finding.kind !== 'NESTED_VALUE');
  if (policyFindings.length > 0) {
    const fields: Record<string, FieldReason> = {};
    for (const finding of policyFindings) {
      fields[finding.key] = finding.kind === 'PERSONAL_KEY' ? 'UNKNOWN_FIELD' : 'PATTERN_MISMATCH';
    }
    return refuse(
      'POLICY_VIOLATION',
      'PERSONAL_DATA_IN_EVENT',
      'The event carries personal data or free text; it is refused rather than redacted.',
      fields,
    );
  }

  // A nested value is a malformed property, not personal data: no declared kind holds an object.
  const nestedFields: Record<string, FieldReason> = {};
  for (const finding of findings) nestedFields[finding.key] = 'OUT_OF_BAND';

  const fields: Record<string, FieldReason> = { ...nestedFields };

  if (raw['platform'] !== 'web') {
    fields['platform'] = raw['platform'] === undefined ? 'REQUIRED' : 'ENUM_MISMATCH';
  }
  const locale = raw['locale'];
  if (locale !== 'en-NG' && locale !== 'yo-NG') {
    fields['locale'] = locale === undefined ? 'REQUIRED' : 'ENUM_MISMATCH';
  }
  checkPattern(raw, 'event_id', EVENT_ID_PATTERN, fields);
  checkPattern(raw, 'session_id', SESSION_ID_PATTERN, fields);
  checkPattern(raw, 'occurred_at', TIMESTAMP_PATTERN, fields);
  checkPattern(raw, 'app_version', APP_VERSION_PATTERN, fields);

  const userId = raw['user_id'];
  if (userId !== null && (typeof userId !== 'string' || !USER_ID_PATTERN.test(userId))) {
    fields['user_id'] = userId === undefined ? 'REQUIRED' : 'PATTERN_MISMATCH';
  }
  const anonymousId = raw['anonymous_id'];
  if (
    anonymousId !== null &&
    (typeof anonymousId !== 'string' || !ANONYMOUS_ID_PATTERN.test(anonymousId))
  ) {
    fields['anonymous_id'] = anonymousId === undefined ? 'REQUIRED' : 'PATTERN_MISMATCH';
  }
  // Exactly one identity: pseudonymous after registration, anonymous before it, never both.
  if (userId === null || userId === undefined) {
    if (anonymousId === null || anonymousId === undefined) fields['user_id'] = 'REQUIRED';
  } else if (typeof anonymousId === 'string') {
    fields['anonymous_id'] = 'ALREADY_SET';
  }

  const correlationId = raw['correlation_id'];
  if (correlationId === undefined) {
    if (definition.requiresCorrelationId) fields['correlation_id'] = 'REQUIRED';
  } else if (typeof correlationId !== 'string' || !CORRELATION_ID_PATTERN.test(correlationId)) {
    fields['correlation_id'] = 'PATTERN_MISMATCH';
  }

  const declared = definition.properties as Readonly<Record<string, AnalyticsPropertyKind>>;
  for (const key of Object.keys(rawProperties)) {
    if (!Object.hasOwn(declared, key)) fields[`properties.${key}`] = 'UNKNOWN_FIELD';
  }
  for (const [key, kind] of Object.entries(declared)) {
    if (!Object.hasOwn(rawProperties, key)) {
      fields[`properties.${key}`] = 'REQUIRED';
      continue;
    }
    const reason = checkKind(kind, rawProperties[key]);
    if (reason !== null) fields[`properties.${key}`] = reason;
  }

  if (Object.keys(fields).length > 0) {
    return refuse(
      'VALIDATION_FAILED',
      'EVENT_ENVELOPE_INVALID',
      'The event does not match the taxonomy.',
      fields,
    );
  }

  const request: AnalyticsEmitRequest = {
    event_name: definition.name,
    event_id: raw['event_id'] as string,
    occurred_at: raw['occurred_at'] as string,
    user_id: typeof userId === 'string' ? userId : null,
    anonymous_id: typeof anonymousId === 'string' ? anonymousId : null,
    session_id: raw['session_id'] as string,
    platform: 'web',
    app_version: raw['app_version'] as string,
    locale: locale as AnalyticsLocale,
    properties: rawProperties as Record<string, string | number | boolean>,
    ...(typeof correlationId === 'string' ? { correlation_id: correlationId } : {}),
  };
  return { ok: true, request };
}

/** What a call site supplies; the envelope's common properties and the taxonomy's payload. */
export interface AnalyticsEventInput<K extends AnalyticsEventName> {
  readonly name: K;
  readonly properties: AnalyticsPayloads[K];
  /** Generated by the id port. */
  readonly eventId: string;
  /** Read from the clock port, as `C-001` formats it. */
  readonly occurredAt: string;
  readonly sessionId: string;
  /** Pseudonymous member id, or `null` before registration. */
  readonly userId: string | null;
  /** Pre-registration identifier, or `null` once the member is registered. */
  readonly anonymousId: string | null;
  readonly appVersion: string;
  readonly locale: AnalyticsLocale;
  /** Required on the four model events and on a failure event. */
  readonly correlationId?: string;
}

/**
 * Builds and validates one event.
 *
 * The result is a value, never a throw: an event that does not conform is reported by the dispatcher
 * and the write that produced it is unaffected.
 */
export function buildAnalyticsEvent<K extends AnalyticsEventName>(
  input: AnalyticsEventInput<K>,
): AnalyticsEmitResult {
  const raw: Record<string, unknown> = {
    event_name: input.name,
    event_id: input.eventId,
    occurred_at: input.occurredAt,
    user_id: input.userId,
    anonymous_id: input.anonymousId,
    session_id: input.sessionId,
    platform: 'web',
    app_version: input.appVersion,
    locale: input.locale,
    properties: input.properties,
  };
  if (input.correlationId !== undefined) raw['correlation_id'] = input.correlationId;
  return parseAnalyticsEmitRequest(raw);
}
