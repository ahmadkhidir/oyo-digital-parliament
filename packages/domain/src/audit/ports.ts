/**
 * The effects the audit module cannot perform itself (`C-090`).
 *
 * Declared beside the rules for the same reason as the analytics ports: `src/ports/` belongs to
 * F0-10 and this module must compile without it. The interfaces are structural, so an adapter
 * satisfies them without importing this file.
 */
import type { AuditAccessLogEntry, AuditEventRecord } from './entities.ts';

/**
 * Append one record to the tamper-evident log.
 *
 * There is no `update`, no `delete` and no `replace` on this interface, and that is the enforcement
 * `C-090` describes: a caller cannot revise the record because no operation exists to do it with.
 *
 * `correlationId` travels beside the entity rather than inside it, because `schema.md` defines no
 * such property on `AuditEvent` while `C-001` requires every record to carry the correlation of the
 * request that produced it. It is stored with the log row, not on the aggregate.
 *
 * @throws when the append did not commit. The caller must then abandon the state change it was
 * recording, because an unaudited change is not permitted.
 */
export interface AuditAppendPort {
  append(
    event: AuditEventRecord,
    correlation: { readonly correlationId?: string },
  ): Promise<{ readonly sequence: number }>;
}

/** Reads the access log: who read, exported or was refused member data, and when. */
export interface AuditAccessLogPort {
  read(query: {
    readonly since?: string;
    readonly limit: number;
  }): Promise<{ readonly entries: readonly AuditAccessLogEntry[]; readonly nextCursor: string | null }>;
}

/** Generates the identifiers the record uses, in the `C-001` form. */
export interface AuditIdentifierPort {
  /** @param prefix - Three lower-case letters, for example `aud`. */
  next(prefix: string): string;
}
