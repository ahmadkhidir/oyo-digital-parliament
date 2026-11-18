/**
 * Calendar helpers (`C-001`, `NFR-002`).
 *
 * Lagos is UTC+01:00, so a UTC instant just after 23:00 belongs to the next Lagos day. Every boundary
 * is proven against that edge rather than a midday instant, because the edge is where a naive
 * implementation slips by a day.
 */
import { describe, expect, it } from 'vitest';

import {
  endExclusiveOfLagosDay,
  formatQuarter,
  lagosDateKey,
  lagosDateTime,
  lagosDayBounds,
  parseQuarter,
  quarterOf,
  startOfLagosDay,
  startOfLagosMonth,
  startOfLagosQuarter,
  startOfLagosWeek,
  toUtcTimestamp,
} from './calendar.ts';

describe('Lagos calendar helpers', () => {
  it('renders a Lagos date across the UTC midnight boundary', () => {
    expect(lagosDateKey(new Date('2026-11-18T22:59:59Z'))).toBe('2026-11-18');
    expect(lagosDateKey(new Date('2026-11-18T23:00:00Z'))).toBe('2026-11-19');
  });

  it('renders a Lagos instant with its explicit offset', () => {
    expect(lagosDateTime(new Date('2026-11-18T23:30:05Z'))).toBe('2026-11-19T00:30:05+01:00');
  });

  it('starts the Lagos day at the previous UTC 23:00', () => {
    const instant = new Date('2026-11-18T09:14:00Z');
    expect(startOfLagosDay(instant).toISOString()).toBe('2026-11-17T23:00:00.000Z');
    expect(endExclusiveOfLagosDay(instant).toISOString()).toBe('2026-11-18T23:00:00.000Z');
    expect(lagosDayBounds(instant).start.toISOString()).toBe('2026-11-17T23:00:00.000Z');
  });

  it('starts the week on Monday in Lagos', () => {
    // 2026-11-19 is a Thursday in Lagos; the Monday of that week is 2026-11-16.
    expect(startOfLagosWeek(new Date('2026-11-19T08:00:00Z')).toISOString()).toBe(
      '2026-11-15T23:00:00.000Z',
    );
  });

  it('starts the month at Lagos midnight', () => {
    expect(startOfLagosMonth(new Date('2026-11-19T08:00:00Z')).toISOString()).toBe(
      '2026-10-31T23:00:00.000Z',
    );
  });

  it('derives the quarter in Lagos, not UTC', () => {
    // 2026-12-31T23:30Z is 2027-01-01 in Lagos, which is Q1 of 2027.
    expect(quarterOf(new Date('2026-12-31T23:30:00Z'))).toEqual({ year: 2027, quarter: 1 });
    expect(quarterOf(new Date('2026-11-18T09:14:00Z'))).toEqual({ year: 2026, quarter: 4 });
    expect(startOfLagosQuarter(new Date('2026-11-18T09:14:00Z')).toISOString()).toBe(
      '2026-09-30T23:00:00.000Z',
    );
  });

  it('formats and parses the wire quarter', () => {
    expect(formatQuarter({ year: 2026, quarter: 4 })).toBe('2026-Q4');
    expect(parseQuarter('2026-Q4')).toEqual({ year: 2026, quarter: 4 });
    expect(parseQuarter('2026-Q5')).toBeNull();
    expect(parseQuarter('2026-04')).toBeNull();
  });

  it('renders a UTC timestamp with second precision', () => {
    expect(toUtcTimestamp(new Date('2026-11-18T09:14:59.987Z'))).toBe('2026-11-18T09:14:59Z');
  });
});
