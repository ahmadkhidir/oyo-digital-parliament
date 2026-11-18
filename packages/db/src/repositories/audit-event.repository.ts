/**
 * The audit log's persistence adapter (`C-090`, `NFR-028`, `packages/domain` `AuditAppendPort`).
 *
 * Two operations exist and no others: an append, and the access-log read. There is no update, no
 * delete and no replace, so the append-only rule is enforced by the shape of this interface as well
 * as by the database trigger the initial migration installs. A correction is a new event that cites
 * the event it corrects.
 *
 * `correlationId` is stored with the row and never returned on the event: `schema.md` gives the entity
 * no such field, and `C-001`/`C-090` both say it travels beside the entity.
 */
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type {
  AuditAccessLogEntry,
  AuditAccessLogPort,
  AuditAppendPort,
  AuditEventRecord,
} from '@odp/domain';
import { executorOf, type Executor } from '../client.ts';
import { auditEvent } from '../schema/audit-event.ts';

/** The actions the access log lists: member-data reads, exports and refusals (`C-077`). */
const ACCESS_LOG_ACTIONS = ['member_data.read', 'member_data.read_refused', 'member_data.export'];

/** One repository implements both domain ports; they share a table and a transaction boundary. */
export interface AuditEventRepository extends AuditAppendPort, AuditAccessLogPort {}

/**
 * Builds the audit repository bound to an executor.
 *
 * @param executor - The shared client, or the transaction the calling write is already inside. The
 * append must share that transaction: a failed append fails the originating change.
 */
export function createAuditEventRepository(executor: Executor): AuditEventRepository {
  const db = executorOf(executor);

  return {
    async append(
      event: AuditEventRecord,
      correlation: { readonly correlationId?: string },
    ): Promise<{ readonly sequence: number }> {
      const inserted = await db
        .insert(auditEvent)
        .values({
          id: event.id,
          actorId: event.actorId,
          actorRole: event.actorRole,
          action: event.action,
          entityType: event.entityType,
          entityId: event.entityId,
          reason: event.reason ?? null,
          occurredAt: event.occurredAt,
          correlationId: correlation.correlationId ?? null,
        })
        .returning({ sequence: auditEvent.sequence });

      const row = inserted[0];
      if (row === undefined) {
        throw new Error('The audit append returned no log position; the change must be abandoned.');
      }
      return { sequence: Number(row.sequence) };
    },

    async read(query: { readonly since?: string; readonly limit: number }): Promise<{
      readonly entries: readonly AuditAccessLogEntry[];
      readonly nextCursor: string | null;
    }> {
      const conditions = [inArray(auditEvent.action, ACCESS_LOG_ACTIONS)];
      if (query.since !== undefined) conditions.push(gte(auditEvent.occurredAt, query.since));

      // Fetch one extra row to know whether another page exists without a second count query.
      const rows = await db
        .select({
          id: auditEvent.id,
          actorId: auditEvent.actorId,
          actorRole: auditEvent.actorRole,
          action: auditEvent.action,
          occurredAt: auditEvent.occurredAt,
          sequence: auditEvent.sequence,
        })
        .from(auditEvent)
        .where(and(...conditions))
        .orderBy(desc(auditEvent.sequence))
        .limit(query.limit + 1);

      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        entries: page.map((row) => ({
          auditEventId: row.id,
          actorId: row.actorId,
          actorRole: row.actorRole,
          action: row.action,
          occurredAt: row.occurredAt,
        })),
        nextCursor: rows.length > query.limit && last !== undefined ? String(last.sequence) : null,
      };
    },
  };
}

/**
 * Reads the full log entry for an entity, for the operator's case history.
 *
 * Deliberately outside the domain ports: `C-090` defines no such read, and this is the narrow helper
 * the admin console composes from, returning the stored entity without the infrastructure columns.
 */
export async function readAuditEventsForEntity(
  executor: Executor,
  input: { readonly entityType: string; readonly entityId: string; readonly limit: number },
): Promise<readonly AuditEventRecord[]> {
  const db = executorOf(executor);
  const rows = await db
    .select({
      id: auditEvent.id,
      actorId: auditEvent.actorId,
      actorRole: auditEvent.actorRole,
      action: auditEvent.action,
      entityType: auditEvent.entityType,
      entityId: auditEvent.entityId,
      reason: auditEvent.reason,
      occurredAt: auditEvent.occurredAt,
    })
    .from(auditEvent)
    .where(
      and(eq(auditEvent.entityType, input.entityType), eq(auditEvent.entityId, input.entityId)),
    )
    .orderBy(desc(auditEvent.sequence))
    .limit(input.limit);

  return rows.map((row) => ({
    id: row.id,
    actorId: row.actorId,
    actorRole: row.actorRole,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    ...(row.reason === null ? {} : { reason: row.reason }),
    occurredAt: row.occurredAt,
  }));
}
