/**
 * Pure calendar helpers for Africa/Lagos (`C-001`, `schema.md` quarters).
 *
 * A calendar boundary is a pure function of an instant: every helper takes the instant as an
 * argument and none reads the clock, so a boundary is reproducible in a test and a caller cannot
 * accidentally mix two instants. Lagos is UTC+01:00 all year — Nigeria has no daylight saving — so a
 * fixed offset is exact rather than an approximation, and no timezone database is consulted.
 *
 * `C-001` fixes the wire formats these helpers produce: timestamps are RFC 3339 in UTC with second
 * precision, calendar dates are `YYYY-MM-DD` interpreted in Africa/Lagos, and a quarter is spelled
 * `YYYY-Qn` (for example `2026-Q4`).
 *
 * @module clock/calendar
 */

/** Lagos is UTC+01:00 all year. */
export const LAGOS_OFFSET_MINUTES = 60;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** A civil date in Lagos. */
export interface CalendarDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** A quarter in the calendar the report card and ward report use. */
export interface Quarter {
  readonly year: number;
  /** 1 to 4. */
  readonly quarter: number;
}

/** The shifted instant whose UTC fields are Lagos civil fields. */
function lagosShifted(instant: Date): Date {
  return new Date(instant.getTime() + LAGOS_OFFSET_MINUTES * MINUTE_MS);
}

/** The UTC instant that corresponds to a Lagos civil midnight. */
function lagosMidnightToInstant(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day) - LAGOS_OFFSET_MINUTES * MINUTE_MS);
}

/** Two-digit zero padding. */
function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * The civil date in Lagos at an instant.
 *
 * @param instant - Any UTC instant.
 * @returns Year, 1-based month and day, as a resident would read the date in Lagos.
 */
export function lagosDate(instant: Date): CalendarDate {
  const shifted = lagosShifted(instant);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * The `YYYY-MM-DD` calendar date in Lagos, as `C-001` prints it.
 *
 * @param instant - Any UTC instant.
 */
export function lagosDateKey(instant: Date): string {
  const date = lagosDate(instant);
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`;
}

/**
 * The RFC 3339 rendering of an instant in Lagos, for a page that states local time.
 *
 * The wire keeps UTC (`toUtcTimestamp`); this form exists for copy that says "closed at 17:00".
 *
 * @param instant - Any UTC instant.
 */
export function lagosDateTime(instant: Date): string {
  const shifted = lagosShifted(instant);
  return (
    `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}` +
    '+01:00'
  );
}

/**
 * An instant as `C-001`'s timestamp convention: RFC 3339, UTC, second precision, suffix `Z`.
 *
 * @param instant - Any UTC instant; the milliseconds are truncated, not rounded.
 */
export function toUtcTimestamp(instant: Date): string {
  const whole = new Date(Math.floor(instant.getTime() / 1000) * 1000);
  return whole.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * The first instant of the Lagos calendar day containing `instant`.
 *
 * @param instant - Any UTC instant.
 */
export function startOfLagosDay(instant: Date): Date {
  const date = lagosDate(instant);
  return lagosMidnightToInstant(date.year, date.month - 1, date.day);
}

/**
 * The first instant after the Lagos calendar day containing `instant`, as an exclusive bound.
 *
 * @param instant - Any UTC instant.
 */
export function endExclusiveOfLagosDay(instant: Date): Date {
  return new Date(startOfLagosDay(instant).getTime() + DAY_MS);
}

/**
 * The first instant of the Lagos calendar week (Monday) containing `instant`.
 *
 * @param instant - Any UTC instant.
 */
export function startOfLagosWeek(instant: Date): Date {
  const dayStart = startOfLagosDay(instant);
  // getUTCDay on the shifted instant is the Lagos weekday; 0 is Sunday.
  const weekday = lagosShifted(dayStart).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return new Date(dayStart.getTime() - daysSinceMonday * DAY_MS);
}

/**
 * The first instant of the Lagos calendar month containing `instant`.
 *
 * @param instant - Any UTC instant.
 */
export function startOfLagosMonth(instant: Date): Date {
  const date = lagosDate(instant);
  return lagosMidnightToInstant(date.year, date.month - 1, 1);
}

/**
 * The quarter containing `instant`, in Lagos.
 *
 * @param instant - Any UTC instant.
 */
export function quarterOf(instant: Date): Quarter {
  const date = lagosDate(instant);
  return { year: date.year, quarter: Math.floor((date.month - 1) / 3) + 1 };
}

/**
 * The first instant of the Lagos quarter containing `instant`.
 *
 * @param instant - Any UTC instant.
 */
export function startOfLagosQuarter(instant: Date): Date {
  const { year, quarter } = quarterOf(instant);
  return lagosMidnightToInstant(year, (quarter - 1) * 3, 1);
}

/**
 * The text form `C-026` and `C-027` use for a quarter.
 *
 * @param quarter - A year and a 1-based quarter.
 */
export function formatQuarter(quarter: Quarter): string {
  return `${pad(quarter.year, 4)}-Q${quarter.quarter}`;
}

/**
 * Parse the `YYYY-Qn` form used on the wire.
 *
 * @param value - The text to parse.
 * @returns The quarter, or `null` when the text is not a quarter.
 */
export function parseQuarter(value: string): Quarter | null {
  const match = /^([0-9]{4})-Q([1-4])$/.exec(value);
  if (match === null) return null;
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

/**
 * The Lagos day boundaries as an inclusive start and an exclusive end.
 *
 * @param instant - Any UTC instant.
 */
export function lagosDayBounds(instant: Date): {
  readonly start: Date;
  readonly endExclusive: Date;
} {
  return {
    start: startOfLagosDay(instant),
    endExclusive: endExclusiveOfLagosDay(instant),
  };
}
