/**
 * Reading the audit access log (`C-090`, `analytics.md` Access).
 *
 * `analytics.md` gives the technical lead and the platform operator query access to raw events, says
 * every query is logged, and lets the external reviewer inspect the access log without seeing event
 * content. This read is that projection and only that projection: it returns who read, what they did
 * and when, and never the reason or the target, which are the two fields that can quote an item.
 */
import type { AuditAccessLogEntry } from './entities.ts';
import type { AuditAccessLogPort } from './ports.ts';

/** `C-001` pagination: limit defaults to 20 and never exceeds 50. */
export const ACCESS_LOG_DEFAULT_LIMIT = 20;
export const ACCESS_LOG_MAX_LIMIT = 50;

/** A query for one page of the access log. */
export interface ReadAuditAccessLogInput {
  /** ISO-8601 instant; entries at or after it are returned. */
  readonly since?: string;
  readonly limit?: number;
}

/** One page of the access log, or the refusal that stopped the read. */
export type ReadAuditAccessLogResult =
  | {
      readonly ok: true;
      readonly entries: readonly AuditAccessLogEntry[];
      readonly nextCursor: string | null;
    }
  | {
      readonly ok: false;
      readonly code: 'VALIDATION_FAILED' | 'SERVICE_DEGRADED';
      readonly cause: string;
      readonly message: string;
      readonly fields: Readonly<Record<string, 'OUT_OF_BAND'>>;
    };

/**
 * Reads a page of the access log.
 *
 * @param deps - The access-log port.
 * @param input - The lower time bound and the page size.
 */
export async function readAuditAccessLog(
  deps: { readonly accessLog: AuditAccessLogPort },
  input: ReadAuditAccessLogInput = {},
): Promise<ReadAuditAccessLogResult> {
  const limit = input.limit ?? ACCESS_LOG_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > ACCESS_LOG_MAX_LIMIT) {
    return {
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'ACCESS_LOG_LIMIT_OUT_OF_BAND',
      message: `The access log returns between 1 and ${ACCESS_LOG_MAX_LIMIT} entries at a time.`,
      fields: { limit: 'OUT_OF_BAND' },
    };
  }

  try {
    const page = await deps.accessLog.read(
      input.since === undefined ? { limit } : { limit, since: input.since },
    );
    return { ok: true, entries: page.entries, nextCursor: page.nextCursor };
  } catch {
    return {
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'ACCESS_LOG_UNAVAILABLE',
      message: 'The access log could not be read.',
      fields: {},
    };
  }
}
