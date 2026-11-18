/**
 * The audit envelope (`C-090`) and its run-time validation.
 *
 * A record is admitted only when it names an actor, that actor's role, a stable action verb, the
 * entity type and identifier, and a time. The reason is optional, and it is refused rather than
 * trimmed when it reads as a copy of the data being protected.
 */
import { ACTOR_ROLES, type ActorRole, type AuditEventDraft } from './entities.ts';
import { AUDIT_ACTION_MAX_LENGTH, AUDIT_ACTION_PATTERN } from './actions.ts';
import { findReasonFinding } from './personal-data.ts';

/**
 * Which `C-001` code a refusal carries. `SERVICE_DEGRADED` comes from the append, never from
 * validation: a record is either well formed or it is not, and separately the log either took it or it
 * did not.
 */
export type AuditFailureCode = 'VALIDATION_FAILED' | 'POLICY_VIOLATION' | 'SERVICE_DEGRADED';

/** A field-level reason token from the frozen `C-001` set. */
export type AuditFieldReason =
  | 'REQUIRED'
  | 'PATTERN_MISMATCH'
  | 'OUT_OF_BAND'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'ENUM_MISMATCH'
  | 'UNKNOWN_FIELD';

/** A refused audit append. */
export interface AuditRejection {
  readonly ok: false;
  readonly code: AuditFailureCode;
  /** Stable upper-snake token. */
  readonly cause: string;
  /** A short explanation for the operator; never echoes the refused value. */
  readonly message: string;
  readonly fields: Readonly<Record<string, AuditFieldReason>>;
}

/** What a caller submits before the identifier is settled. */
export interface AuditEventInput {
  /** Omitted when the caller has no identifier yet; the append generates one. */
  readonly id?: string;
  readonly actorId: string;
  readonly actorRole: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly reason?: string;
  readonly occurredAt: string;
  /** Ties the record to the request that caused it (`C-001` audit correlation). */
  readonly correlationId?: string;
}

/** The submitted record and the correlation it was submitted with. */
export interface AcceptedAuditEvent {
  readonly event: AuditEventDraft;
  /** Absent when the caller supplied none. */
  readonly correlationId?: string;
}

/** The outcome of validating an audit submission. */
export type AuditValidationResult =
  { readonly ok: true; readonly accepted: AcceptedAuditEvent } | AuditRejection;

/**
 * Identifier and timestamp patterns.
 *
 * `actorId` and `entityId` accept the `C-001` form with any three-letter prefix, because an actor may
 * be a member or a staff user and an entity may be any of the record's aggregates. The body is
 * upper-case alphanumeric over a 4-to-26 length range, which is the reconciled `C-001` form.
 */
const RECORD_IDENTIFIER_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;
const AUDIT_ID_PATTERN = /^aud_[0-9A-Z]{4,26}$/;
const CORRELATION_ID_PATTERN = /^req_[0-9A-Z]{4,32}$/;
const TIMESTAMP_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
/** An entity type is one capitalised word: `Decision`, `Comment`, `Member`. */
const ENTITY_TYPE_PATTERN = /^[A-Z][A-Za-z]{0,59}$/;

/** Envelope keys `C-090` declares. Anything else is refused rather than ignored. */
const ENVELOPE_KEYS: readonly string[] = [
  'id',
  'actorId',
  'actorRole',
  'action',
  'entityType',
  'entityId',
  'reason',
  'occurredAt',
  'correlationId',
];

/** The longest reason `schema.md` allows. */
const REASON_MAX_LENGTH = 1000;

/** The longest entity type `schema.md` allows. */
const ENTITY_TYPE_MAX_LENGTH = 60;

/** A refusal that is not about one field. */
function refuse(
  code: AuditFailureCode,
  cause: string,
  message: string,
  fields: Readonly<Record<string, AuditFieldReason>> = {},
): AuditRejection {
  return { ok: false, code, cause, message, fields };
}

/** Reads one required string and records `REQUIRED` when it is missing. */
function requiredString(
  raw: Readonly<Record<string, unknown>>,
  key: string,
  fields: Record<string, AuditFieldReason>,
): string | null {
  const value = raw[key];
  if (typeof value !== 'string' || value.length === 0) {
    fields[key] = 'REQUIRED';
    return null;
  }
  return value;
}

/**
 * Validates one audit submission against `C-090`.
 *
 * @param raw - The candidate record, as it arrived on the internal RPC.
 */
export function validateAuditEventInput(raw: unknown): AuditValidationResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return refuse(
      'VALIDATION_FAILED',
      'ENVELOPE_MALFORMED',
      'The audit envelope is not an object.',
    );
  }
  const input = raw as Readonly<Record<string, unknown>>;

  const undeclared = Object.keys(input).filter((key) => !ENVELOPE_KEYS.includes(key));
  if (undeclared.length > 0) {
    return refuse(
      'VALIDATION_FAILED',
      'ENVELOPE_FIELD_NOT_DECLARED',
      'The record carries a field `C-090` does not declare.',
      Object.fromEntries(undeclared.map((key) => [key, 'UNKNOWN_FIELD' as const])),
    );
  }

  const reason = input['reason'];
  if (reason !== undefined && typeof reason === 'string') {
    const finding = findReasonFinding(reason);
    if (finding !== null) {
      return refuse(
        'POLICY_VIOLATION',
        'PERSONAL_DATA_IN_AUDIT_REASON',
        'The reason reads as a copy of the item it describes; write it from identifiers instead.',
        { reason: 'PATTERN_MISMATCH' },
      );
    }
  }

  const fields: Record<string, AuditFieldReason> = {};
  const actorId = requiredString(input, 'actorId', fields);
  const action = requiredString(input, 'action', fields);
  const entityType = requiredString(input, 'entityType', fields);
  const entityId = requiredString(input, 'entityId', fields);
  const occurredAt = requiredString(input, 'occurredAt', fields);

  const actorRole = input['actorRole'];
  if (typeof actorRole !== 'string') {
    fields['actorRole'] = 'REQUIRED';
  } else if (!(ACTOR_ROLES as readonly string[]).includes(actorRole)) {
    fields['actorRole'] = 'ENUM_MISMATCH';
  }

  if (actorId !== null && !RECORD_IDENTIFIER_PATTERN.test(actorId))
    fields['actorId'] = 'PATTERN_MISMATCH';
  if (entityId !== null && !RECORD_IDENTIFIER_PATTERN.test(entityId))
    fields['entityId'] = 'PATTERN_MISMATCH';
  if (occurredAt !== null && !TIMESTAMP_PATTERN.test(occurredAt))
    fields['occurredAt'] = 'PATTERN_MISMATCH';

  if (action !== null) {
    if (action.length > AUDIT_ACTION_MAX_LENGTH) fields['action'] = 'TOO_LONG';
    else if (!AUDIT_ACTION_PATTERN.test(action)) fields['action'] = 'PATTERN_MISMATCH';
  }

  if (entityType !== null) {
    if (entityType.length > ENTITY_TYPE_MAX_LENGTH) fields['entityType'] = 'TOO_LONG';
    else if (!ENTITY_TYPE_PATTERN.test(entityType)) fields['entityType'] = 'PATTERN_MISMATCH';
  }

  const id = input['id'];
  if (id !== undefined && (typeof id !== 'string' || !AUDIT_ID_PATTERN.test(id))) {
    fields['id'] = 'PATTERN_MISMATCH';
  }

  const correlationId = input['correlationId'];
  if (
    correlationId !== undefined &&
    (typeof correlationId !== 'string' || !CORRELATION_ID_PATTERN.test(correlationId))
  ) {
    fields['correlationId'] = 'PATTERN_MISMATCH';
  }

  if (reason !== undefined && typeof reason !== 'string') fields['reason'] = 'OUT_OF_BAND';
  else if (typeof reason === 'string' && reason.length > REASON_MAX_LENGTH)
    fields['reason'] = 'TOO_LONG';
  else if (typeof reason === 'string' && reason.length === 0) fields['reason'] = 'TOO_SHORT';

  if (Object.keys(fields).length > 0) {
    return refuse(
      'VALIDATION_FAILED',
      'AUDIT_EVENT_INVALID',
      'The record does not match the audit schema.',
      fields,
    );
  }

  const event: AuditEventDraft = {
    ...(typeof id === 'string' ? { id } : {}),
    actorId: actorId as string,
    actorRole: actorRole as ActorRole,
    action: action as string,
    entityType: entityType as string,
    entityId: entityId as string,
    ...(typeof reason === 'string' ? { reason } : {}),
    occurredAt: occurredAt as string,
  };
  return {
    ok: true,
    accepted: {
      event,
      ...(typeof correlationId === 'string' ? { correlationId } : {}),
    },
  };
}
