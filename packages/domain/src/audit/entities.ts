/**
 * The audit record (`schema.md` AuditEvent, `C-090`).
 *
 * Field names and enum spellings mirror the schema verbatim. The record is append-only: there is no
 * mutable projection of it anywhere in this module, and the store port offers one operation, `append`
 * (`NFR-028`).
 */

/**
 * The role the actor held at the time of the change. `system` covers a scheduled job, which acts
 * without a person and must still be attributable.
 */
export const ACTOR_ROLES = [
  'member',
  'ward_organiser',
  'response_staff',
  'moderator',
  'external_reviewer',
  'legal_reviewer',
  'operator',
  'system',
] as const;

/** One of the roles an audit record may name. */
export type ActorRole = (typeof ACTOR_ROLES)[number];

/** One recorded state change, before its identifier is settled. */
export interface AuditEventDraft {
  /** `aud_` identifier, when the caller already holds one. */
  readonly id?: string;
  /** References the Member or StaffUser who acted; `system` for a scheduled job. */
  readonly actorId: string;
  /** The role the actor held at the time. */
  readonly actorRole: ActorRole;
  /** A stable verb, for example `decision.published`. */
  readonly action: string;
  /** The entity affected, for example `Decision`. */
  readonly entityType: string;
  /** The identifier of the affected entity. */
  readonly entityId: string;
  /** Why, where a reason is required. Refused if it reproduces a name, a number or held text. */
  readonly reason?: string;
  /** When it happened, as `C-001` formats it. */
  readonly occurredAt: string;
}

/** One recorded state change, as it is stored. */
export interface AuditEventRecord extends AuditEventDraft {
  /** `aud_` identifier of the event itself. */
  readonly id: string;
}

/**
 * What the external reviewer and the operator may see of the log (`analytics.md` Access, `C-090`).
 *
 * `reason` and `entityId` are deliberately absent: the reason can quote the text of a held item and
 * the target can name a submission whose author asked for deletion, and neither belongs in a
 * projection handed to someone outside the platform team.
 */
export interface AuditAccessLogEntry {
  readonly auditEventId: string;
  readonly actorId: string;
  readonly actorRole: ActorRole;
  readonly action: string;
  /** When the read, export or refusal was recorded. */
  readonly occurredAt: string;
}
