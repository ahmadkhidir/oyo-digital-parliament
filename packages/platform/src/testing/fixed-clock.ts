/**
 * The clock double.
 *
 * Time is a parameter in every test: a fixed instant, advanced explicitly, so a TTL, an expiry or an
 * overdue computation is proven without waiting. It implements the same `ClockPort` the system clock
 * does.
 *
 * @module testing/fixed-clock
 */
import type { ClockPort } from '../../../domain/src/ports/clock.ts';

/** A clock a test can move. */
export interface FixedClock extends ClockPort {
  /** Replace the current instant. */
  set(instant: Date | string): void;
  /** Move the current instant forward (or back, with a negative value) by milliseconds. */
  advance(milliseconds: number): void;
  /** The current instant, as a copy. */
  current(): Date;
}

/**
 * Create a fixed clock.
 *
 * @param start - The initial instant. Defaults to `2026-11-18T09:00:00Z`, a date this product's
 *   contracts use in their examples.
 */
export function createFixedClock(start: Date | string = '2026-11-18T09:00:00Z'): FixedClock {
  let instant = typeof start === 'string' ? new Date(start) : new Date(start.getTime());
  if (Number.isNaN(instant.getTime())) throw new Error('fixed clock needs a valid instant');

  return {
    now: () => new Date(instant.getTime()),
    set(value) {
      instant = typeof value === 'string' ? new Date(value) : new Date(value.getTime());
      if (Number.isNaN(instant.getTime())) throw new Error('fixed clock needs a valid instant');
    },
    advance(milliseconds) {
      instant = new Date(instant.getTime() + milliseconds);
    },
    current: () => new Date(instant.getTime()),
  };
}
