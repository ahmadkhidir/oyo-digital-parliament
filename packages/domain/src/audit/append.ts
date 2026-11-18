/**
 * Appending one audit record (`C-090`, `NFR-028`).
 *
 * The append is the last thing a state-changing use case does before it returns, and it is awaited
 * rather than fired and forgotten: if the log did not commit the write did not happen. `C-090` and
 * `C-001` are explicit that `SERVICE_DEGRADED` here fails the originating change, which is the
 * opposite of the analytics rule, and the reason is in `NFR-028`: a change nobody can account for is
 * not a change the campaign is allowed to keep.
 */
import type { AuditEventDraft } from './entities.ts';
import {
  validateAuditEventInput,
  type AcceptedAuditEvent,
  type AuditRejection,
} from './envelope.ts';
import type { AuditAppendPort, AuditIdentifierPort } from './ports.ts';

/** The ports an append needs. */
export interface AppendAuditEventDeps {
  readonly store: AuditAppendPort;
  readonly identifiers: AuditIdentifierPort;
}

/** What a state-changing use case submits. */
export type AppendAuditEventInput = AuditEventDraft & { readonly correlationId?: string };

/** The recorded append, in the `C-090` response shape. */
export interface AuditAppendAccepted {
  readonly ok: true;
  readonly id: string;
  readonly appended: true;
  readonly sequence: number;
  readonly occurredAt: string;
}

/** The outcome of an append. */
export type AppendAuditEventResult = AuditAppendAccepted | AuditRejection;

/**
 * Appends an already-validated record.
 *
 * Used by the `C-077` boundary, which has validated the submission on the way in, so a record is not
 * checked twice for no gain.
 */
export async function appendValidatedAuditEvent(
  deps: AppendAuditEventDeps,
  accepted: AcceptedAuditEvent,
): Promise<AppendAuditEventResult> {
  const draft = accepted.event;
  const record = { ...draft, id: draft.id ?? deps.identifiers.next('aud') };

  try {
    const { sequence } = await deps.store.append(
      record,
      accepted.correlationId === undefined ? {} : { correlationId: accepted.correlationId },
    );
    return { ok: true, id: record.id, appended: true, sequence, occurredAt: record.occurredAt };
  } catch {
    return {
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'AUDIT_APPEND_FAILED',
      message: 'The record could not be written to the audit log, so the change was not kept.',
      fields: {},
    };
  }
}

/**
 * Validates and appends one audit record.
 *
 * @param deps - The append port and the identifier generator.
 * @param input - Actor, role, action, target, time, and the reason where one is required.
 * @returns The stored record's identifier and log position, or the refusal that stopped it.
 */
export async function appendAuditEvent(
  deps: AppendAuditEventDeps,
  input: AppendAuditEventInput,
): Promise<AppendAuditEventResult> {
  const validated = validateAuditEventInput(input);
  if (!validated.ok) return validated;
  return appendValidatedAuditEvent(deps, validated.accepted);
}
