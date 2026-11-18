/**
 * AuditEvent (`schema.md` AuditEvent, `C-090`, `NFR-028`).
 *
 * One recorded state change, written append-only so the record can be defended after the fact. The
 * table has no foreign keys at all: a cascade into the audit log would delete history, and
 * `schema.md` gives `actorId` and `entityId` no single target (a member or a staff user; any entity).
 *
 * Two columns are **infrastructure, not entity properties**, and a read never returns them as part of
 * the event:
 *
 * - `sequence` is the row's position in the append-only log, the value `C-090` returns as `sequence`.
 *   `schema.md` gives the entity no such field; the log needs one to paginate deterministically.
 * - `correlation_id` is the `C-001` request identifier. `schema.md` defines no such property, and
 *   `C-001` and `C-090` both say it travels beside the entity. It is stored with the row and not
 *   returned by the event read.
 *
 * Append-only is enforced in the database, not only by the absence of a code path: the migration
 * installs a trigger that raises on `UPDATE` and `DELETE`, so no role can rewrite an entry. A
 * correction is a new event that cites the event it corrects.
 *
 * `reason` must not reproduce a name, a telephone number, a ward description or held text; the domain
 * refuses such an append before it reaches this table (`C-090`).
 */
import { relations, sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, unique, varchar } from 'drizzle-orm/pg-core';
import { actorRole } from './enums.ts';
import { isIdentifier, utcTimestamp } from './columns.ts';

export const auditEvent = pgTable(
  'audit_event',
  {
    id: text('id').primaryKey(),
    /** References a Member or a StaffUser; `system` for a scheduled job. No single table, no FK. */
    actorId: text('actor_id').notNull(),
    actorRole: actorRole('actor_role').notNull(),
    /** A stable verb such as `decision.published`. */
    action: varchar('action', { length: 80 }).notNull(),
    entityType: varchar('entity_type', { length: 60 }).notNull(),
    entityId: text('entity_id').notNull(),
    reason: varchar('reason', { length: 1000 }),
    occurredAt: utcTimestamp('occurred_at').notNull(),
    /** Infrastructure: the row's position in the append-only log (`C-090` response `sequence`). */
    sequence: bigint('sequence', { mode: 'number' }).generatedAlwaysAsIdentity(),
    /** Infrastructure: the request correlation, carried beside the entity and never read back on it. */
    correlationId: text('correlation_id'),
  },
  (t) => [
    check('audit_event_id_format', isIdentifier(t.id)),
    check('audit_event_actor_id_format', isIdentifier(t.actorId)),
    check('audit_event_entity_id_format', isIdentifier(t.entityId)),
    check('audit_event_action_format', sql`${t.action} ~ '^[a-z][a-z_]*\\.[a-z][a-z_]*$'`),
    check(
      'audit_event_correlation_format',
      sql`${t.correlationId} is null or ${t.correlationId} ~ '^req_[0-9A-Z]{4,32}$'`,
    ),
    // Read path: the access-log read (`analytics.md` Access, `C-077`), which lists only member-data
    // reads, exports and refusals, newest first.
    index('audit_event_access_idx')
      .on(t.occurredAt)
      .where(sql`${t.action} like 'member_data.%'`),
    // Read path: the history of one entity (`C-090`, `operations.md` Admin & Governance).
    index('audit_event_entity_idx').on(t.entityType, t.entityId, t.occurredAt),
    // Read path: the 24-month retention sweep (nfr.md Data lifecycle).
    index('audit_event_occurred_idx').on(t.occurredAt),
    // Deterministic log order, and the cursor the access log pages on.
    unique('audit_event_sequence_key').on(t.sequence),
  ],
);

export const auditEventRelations = relations(auditEvent, () => ({}));
