/**
 * The system clock: the only production source of the current instant.
 *
 * Everything else in the application receives this through the domain `ClockPort`, so a test can
 * substitute a fixed instant and a use case cannot read ambient time. This file and `src/ids/` are
 * the only places in the package allowed to call `new Date()` or `Date.now()`
 * (`packages/platform/AGENTS.md` Discipline).
 *
 * @module clock/clock
 */
import type { ClockPort } from '../../../domain/src/ports/clock.ts';

/** The UTC system clock. */
export function createSystemClock(): ClockPort {
  return {
    now: () => new Date(),
  };
}

/** The shared production clock. Stateless, so one instance is enough. */
export const systemClock: ClockPort = createSystemClock();
