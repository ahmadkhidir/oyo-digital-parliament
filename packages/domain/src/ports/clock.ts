/**
 * The one effect the domain cannot perform itself: reading the current instant.
 *
 * Time is injected, never ambient (`packages/domain/AGENTS.md` Discipline). A use case that decides
 * whether a commitment is overdue, whether a one-time code has expired or whether a rate-limit window
 * has rolled over receives this port and calls it once; a pure calendar helper then turns the instant
 * into a Lagos day or a quarter boundary. `Date.now()` and `new Date()` never appear in this package,
 * and the production implementation lives in `packages/platform`.
 */
export interface ClockPort {
  /**
   * The current instant.
   *
   * @returns A `Date` holding a UTC instant. Callers must not mutate it, and must not treat the local
   *   timezone of the process as meaningful — calendar rendering is a separate, pure step.
   */
  now(): Date;
}
