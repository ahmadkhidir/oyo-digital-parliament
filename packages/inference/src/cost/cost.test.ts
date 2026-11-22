/**
 * Cost accounting (`NFR-050` to `NFR-053`, `C-078`).
 */
import { describe, expect, it } from 'vitest';

import { callCostMicros, createCostLedger } from '../index.ts';
import { manualClock } from '../../test/support.ts';

describe('callCostMicros', () => {
  it('charges a call its share of the per-1,000-unit ceiling, rounded up', () => {
    expect(callCostMicros({ units: 1000 }, 50000)).toBe(50000);
    expect(callCostMicros({ units: 1 }, 50000)).toBe(50);
    expect(callCostMicros({ units: 0 }, 50000)).toBe(0);
    expect(callCostMicros(null, 50000)).toBe(0);
  });
});

describe('createCostLedger', () => {
  it('trips at the ceiling and reports the seconds left in the window', () => {
    const clock = manualClock(0);
    const ledger = createCostLedger({ now: clock.now, windowSeconds: 60 });

    expect(ledger.check('ward_candidate', 100)).toEqual({ allowed: true });
    ledger.record('ward_candidate', 100);
    const refused = ledger.check('ward_candidate', 100);
    expect(refused.allowed).toBe(false);
    if (refused.allowed) return;
    expect(refused.retryAfterSeconds).toBe(60);
  });

  it('starts a fresh window', () => {
    const clock = manualClock(0);
    const ledger = createCostLedger({ now: clock.now, windowSeconds: 60 });

    ledger.record('ward_candidate', 100);
    clock.advance(60_000);
    expect(ledger.check('ward_candidate', 100)).toEqual({ allowed: true });
  });

  it('keeps each capability in its own window', () => {
    const clock = manualClock(0);
    const ledger = createCostLedger({ now: clock.now, windowSeconds: 60 });

    ledger.record('ward_candidate', 100);
    expect(ledger.check('ward_candidate', 100).allowed).toBe(false);
    expect(ledger.check('similar_submission', 100).allowed).toBe(true);
  });
});
