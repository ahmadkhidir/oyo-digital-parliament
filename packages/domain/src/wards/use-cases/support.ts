/**
 * The two effects every state-changing ward use case shares: the audit append and the analytics emit.
 *
 * Neither is a use case. They exist so the six ward actions tell the same story to the log and the
 * taxonomy: one audit event per state change, awaited and fatal to the write (`C-090`, `NFR-028`),
 * and analytics events that cannot fail it (`C-089`).
 */
import { appendAuditEvent } from '../../audit/index.ts';
import { wardFailure, type WardFailure } from '../entities.ts';
import type { WardAnalyticsEvent, WardPorts } from '../ports.ts';

/** The audit fields a ward action supplies about itself. */
export interface WardAuditInput {
  readonly actorId: string;
  readonly actorRole: 'member' | 'response_staff';
  /** A stable dotted verb, for example `ward.resolved`. */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  /** A stable token, never the resident's wording (`C-090` personal-data rule). */
  readonly reason?: string;
  readonly occurredAt: string;
  readonly correlationId?: string;
}

/**
 * Appends the one audit record for a state change.
 *
 * A failure to append is returned rather than thrown, because the caller must then abandon the
 * change: the write and its audit record commit together or not at all (`NFR-028`).
 */
export async function appendWardAudit(
  deps: Pick<WardPorts, 'audit' | 'identifiers'>,
  input: WardAuditInput,
): Promise<WardFailure | null> {
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
  return wardFailure(appended.code, appended.cause, appended.message, appended.fields);
}

/**
 * Emits product events, one at a time, without letting a failure reach the caller.
 *
 * `C-089` makes a lost event the emitter's to buffer, not a reason to undo a ward the resident just
 * confirmed, so a rejected emit is dropped here and reported nowhere in the result.
 */
export async function emitWardAnalytics(
  deps: Pick<WardPorts, 'analytics'>,
  events: readonly WardAnalyticsEvent[],
): Promise<void> {
  for (const event of events) {
    try {
      await deps.analytics.emit(event);
    } catch {
      // The event is dropped; the write it describes stands (`C-089`).
    }
  }
}
