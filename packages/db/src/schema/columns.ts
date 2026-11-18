/**
 * Column helpers shared by the entity modules.
 *
 * One place decides how a `C-001` identifier, an instant and a calendar date are stored, so a new
 * table cannot quietly introduce a second convention. `schema.md` is the authority for which of these
 * a field is; this module only fixes the physical representation:
 *
 * - an identifier is `text` in the `C-001` form `^[a-z]{3}_[0-9A-Z]{4,26}$` (the record prefix is
 *   lower-case, the opaque body upper-case alphanumeric);
 * - an instant is `timestamptz` at second precision, matching `C-001`'s "RFC 3339, UTC, second
 *   precision";
 * - a calendar date is `date` with no time, because `C-001` fixes it as `YYYY-MM-DD` in
 *   Africa/Lagos and a timestamp would invent a time of day the specification never gives.
 */
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { customType, date } from 'drizzle-orm/pg-core';

/** The `C-001` record identifier form. Correlation identifiers (`req_`) use a different pattern. */
export const IDENTIFIER_PATTERN = '^[a-z]{3}_[0-9A-Z]{4,26}$';

/** A `check` expression asserting a column is a `C-001` record identifier. */
export const isIdentifier = (column: AnyPgColumn) => sql`${column} ~ '^[a-z]{3}_[0-9A-Z]{4,26}$'`;

/**
 * A UTC instant at second precision.
 *
 * The driver hands back PostgreSQL's text form (`2026-01-06 00:00:00+00`), while `C-001` fixes every
 * exchanged instant as RFC 3339 UTC with a `Z` suffix. The conversion lives here, in the column type,
 * so no repository has to remember it and two repositories cannot disagree about the format.
 */
const utcInstant = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'timestamp(0) with time zone';
  },
  fromDriver(value: string): string {
    return toContractInstant(value);
  },
});

/** Normalises a stored instant to `C-001`'s `2026-01-06T00:00:00Z` form. */
export function toContractInstant(value: string): string {
  // PostgreSQL prints `2026-01-06 00:00:00+00`; JavaScript needs the `T` and a two-part offset.
  const normalised = value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const parsed = new Date(normalised);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A UTC instant with the `C-001` representation on the way out. */
export const utcTimestamp = (name: string) => utcInstant(name);

/** A `YYYY-MM-DD` calendar date, interpreted by the caller in Africa/Lagos (`C-001`). */
export const calendarDate = (name: string) => date(name, { mode: 'string' });
