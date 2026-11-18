/**
 * The effects every state-changing identity use case shares.
 *
 * None of these is a use case. They exist so the registration, the sign-in, the rights actions and the
 * staff flow tell the same story to the log and the taxonomy: one audit event per state change,
 * awaited and fatal to the write (`C-090`, `NFR-028`), analytics that cannot fail it (`C-089`), and an
 * idempotent replay that returns the recorded answer rather than a second write (`C-001`, `C-092`).
 */
import type { ActorRole } from '../../audit/index.ts';
import { appendAuditEvent } from '../../audit/index.ts';
import type { IdentityFailure } from '../entities.ts';
import { identityFailure } from '../entities.ts';
import type { IdentityAnalyticsEvent, IdentityPorts, RecordedAnswer } from '../ports.ts';

/** The audit fields an identity action supplies about itself. */
export interface IdentityAuditInput {
  readonly actorId: string;
  readonly actorRole: ActorRole;
  /** A stable dotted verb, for example `member.registered` or `staff.signed_in`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  /** A stable token or a short statement of fact, never a secret or a person's data (`C-090`). */
  readonly reason?: string;
  readonly occurredAt: string;
  readonly correlationId?: string;
}

/**
 * Appends the one audit record for a state change.
 *
 * A failure to append is returned rather than thrown, because the change must then be abandoned: the
 * write and its audit record commit together or not at all (`NFR-028`).
 */
export async function appendIdentityAudit(
  deps: Pick<IdentityPorts, 'audit' | 'identifiers'>,
  input: IdentityAuditInput,
): Promise<IdentityFailure | null> {
  const appended = await appendAuditEvent(
    { store: deps.audit, identifiers: deps.identifiers },
    {
      actorId: input.actorId,
      actorRole: input.actorRole,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      occurredAt: input.occurredAt,
      ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
    },
  );
  if (appended.ok) return null;
  return identityFailure(appended.code, appended.cause, appended.message, appended.fields);
}

/**
 * Emits product events, one at a time, without letting a failure reach the caller.
 *
 * `C-089` makes a lost event the emitter's to buffer, not a reason to undo an account the resident just
 * created, so a rejected emit is dropped here and reported nowhere in the result.
 */
export async function emitIdentityAnalytics(
  deps: Pick<IdentityPorts, 'analytics'>,
  events: readonly IdentityAnalyticsEvent[],
): Promise<void> {
  for (const event of events) {
    try {
      await deps.analytics.emit(event);
    } catch {
      // The event is dropped; the write it describes stands (`C-089`).
    }
  }
}

/** The outcome of looking a key up before a write. */
export type ReplayLookup<T> =
  | { readonly kind: 'none' }
  | { readonly kind: 'replay'; readonly result: T }
  | { readonly kind: 'mismatch' };

/**
 * Looks up a previous answer for this idempotency key.
 *
 * The recorded value was written by this same use case for this same fingerprint, so narrowing it back
 * to `T` with the caller's guard cannot invent a shape the domain did not produce.
 */
export async function lookupReplay<T>(
  deps: Pick<IdentityPorts, 'idempotency'>,
  key: string,
  fingerprint: string,
  isResult: (value: unknown) => value is T,
): Promise<ReplayLookup<T>> {
  let recorded: RecordedAnswer | null;
  try {
    recorded = await deps.idempotency.read(key);
  } catch {
    // A replay store that cannot be read is treated as a first attempt. The write itself is still
    // guarded by the domain's own rules; only the replay shortcut is lost.
    return { kind: 'none' };
  }
  if (recorded === null) return { kind: 'none' };
  if (recorded.fingerprint !== fingerprint) return { kind: 'mismatch' };
  return isResult(recorded.result) ? { kind: 'replay', result: recorded.result } : { kind: 'none' };
}

/** Records the answer for a key after a successful write. */
export async function recordAnswer(
  deps: Pick<IdentityPorts, 'idempotency'>,
  key: string,
  fingerprint: string,
  result: unknown,
): Promise<void> {
  try {
    await deps.idempotency.record(key, { fingerprint, result });
  } catch {
    // The write succeeded; a replay store that refuses is the emitter's to repair, not a reason to
    // report a failure the caller did not have (`C-001`).
  }
}

/** One limiter answer, with a store failure separated from a refusal. */
export type LimitOutcome =
  | { readonly ok: true; readonly allowed: boolean; readonly retryAfterSeconds: number }
  | { readonly ok: false };

/**
 * Consults the limiter without letting a store failure escape.
 *
 * `NFR-027` puts the limiter in front of every registration, sign-in and rights call; a limiter that
 * cannot answer must not become an unhandled exception, and it must not silently admit either. The
 * caller answers `SERVICE_DEGRADED` when `ok` is false.
 */
export async function consumeRateLimit(
  deps: Pick<IdentityPorts, 'rateLimits'>,
  input: Parameters<IdentityPorts['rateLimits']['consume']>[0],
): Promise<LimitOutcome> {
  try {
    const outcome = await deps.rateLimits.consume(input);
    return { ok: true, allowed: outcome.allowed, retryAfterSeconds: outcome.retryAfterSeconds };
  } catch {
    return { ok: false };
  }
}

/** Whether a value is a plain object, the first step of the result guards below. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * A stable fingerprint of the validated request.
 *
 * Built from an ordered array rather than an object, so two payloads that differ only in key order are
 * the same request and a replay returns the recorded answer (`C-001`).
 */
export function fingerprintOf(
  parts: readonly (string | number | boolean | null | undefined)[],
): string {
  return JSON.stringify(parts.map((part) => (part === undefined ? null : part)));
}

/** `C-001`: a reused key with a different payload is refused, never answered twice. */
export function reusedKeyFailure(): IdentityFailure {
  return identityFailure(
    'VALIDATION_FAILED',
    'IDEMPOTENCY_KEY_REUSED',
    'That idempotency key was already used for a different request.',
    // `C-001`'s printed example spells this token `REUSED_WITH_DIFFERENT_PAYLOAD`, which is outside
    // the frozen field-reason set it defines; `ALREADY_SET` is the vocabulary's own token.
    { 'Idempotency-Key': 'ALREADY_SET' },
  );
}

/**
 * Appends `staff.sign_in_refused` with the stable reason token `C-092` fixes.
 *
 * A refused sign-in still answers its refusal when the log cannot take the entry: failing the response
 * would tell an attacker more than the refusal does, and the attempt is already counted by the limiter.
 */
export async function refuseStaffSignIn(
  deps: Pick<IdentityPorts, 'audit' | 'identifiers'>,
  input: {
    readonly staffId: string;
    readonly role: ActorRole;
    readonly reason: string;
    readonly occurredAt: string;
    readonly correlationId?: string;
  },
): Promise<void> {
  await appendIdentityAudit(deps, {
    actorId: input.staffId,
    actorRole: input.role,
    action: 'staff.sign_in_refused',
    entityType: 'StaffUser',
    entityId: input.staffId,
    reason: input.reason,
    occurredAt: input.occurredAt,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
  });
}
