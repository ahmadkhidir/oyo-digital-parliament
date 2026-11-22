/**
 * Per-call cost from provider-reported usage (`NFR-050` to `NFR-053`, `C-078`).
 *
 * The judged bars price a capability in USD micros per 1,000 units. Usage is what the provider
 * reports for one call, so the cost of that call is its share of the ceiling, rounded up: a call is
 * never recorded as free because it was small.
 *
 * @module cost/cost
 */
import type { ModelUsage } from '../adapters/types.ts';

/**
 * @param usage - Provider-reported usage, or `null` when the provider reported none.
 * @param ceilingMicrosPerThousand - The capability's pinned ceiling.
 * @returns The call's cost in USD micros; zero only when no usage was reported.
 */
export function callCostMicros(usage: ModelUsage | null, ceilingMicrosPerThousand: number): number {
  if (usage === null || usage.units <= 0) return 0;
  return Math.ceil((usage.units * ceilingMicrosPerThousand) / 1000);
}
