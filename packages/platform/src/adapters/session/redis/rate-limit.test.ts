/**
 * The fixed-window limiter (`NFR-027`, `C-001`).
 *
 * The suite proves the cap, the fixed window, the refusal's wait, the subject separation and the two
 * rules that keep personal data out of Redis: no key carries the value, and no bucket without a cap is
 * silently unlimited.
 */
import { describe, expect, it } from 'vitest';

import { createFixedClock } from '../../../testing/fixed-clock.ts';
import { createMemorySessionStore } from './memory-session-store.ts';
import { createFixedWindowRateLimiter } from './rate-limit.ts';

const NUMBER = '+2348031234567';

function harness() {
  const clock = createFixedClock('2026-11-18T09:00:00Z');
  const memory = createMemorySessionStore(clock);
  const rateLimits = createFixedWindowRateLimiter({
    store: memory,
    clock,
    policies: {
      sign_in: { limit: 3, windowSeconds: 15 * 60 },
      registration: { limit: 2, windowSeconds: 15 * 60 },
    },
  });
  return { clock, memory, rateLimits };
}

describe('fixed-window limiter', () => {
  it('allows the cap and refuses the next call with a wait to the window boundary', async () => {
    const { rateLimits } = harness();
    const subject = { kind: 'number' as const, value: NUMBER };

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const allowed = await rateLimits.consume({ bucket: 'sign_in', subject });
      expect(allowed.allowed).toBe(true);
      expect(allowed.limit).toBe(3);
      expect(allowed.remaining).toBe(3 - attempt);
    }

    const refused = await rateLimits.consume({ bucket: 'sign_in', subject });
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.retryAfterSeconds).toBeLessThanOrEqual(15 * 60);
  });

  it('counts each subject separately and never writes the value itself', async () => {
    const { memory, rateLimits } = harness();
    const first = { kind: 'number' as const, value: NUMBER };
    const second = { kind: 'member' as const, value: NUMBER };

    await rateLimits.consume({ bucket: 'registration', subject: first });

    // Same text under a different kind is a different counter.
    const other = await rateLimits.consume({ bucket: 'registration', subject: second });
    expect(other.allowed).toBe(true);
    expect(other.remaining).toBe(1);

    for (const key of memory.keys()) {
      expect(key).not.toContain(NUMBER);
      expect(key).not.toContain('2348031234567');
    }
  });

  it('resets when the fixed window turns over', async () => {
    const { clock, rateLimits } = harness();
    const subject = { kind: 'number' as const, value: NUMBER };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await rateLimits.consume({ bucket: 'sign_in', subject });
    }
    await expect(rateLimits.consume({ bucket: 'sign_in', subject })).resolves.toMatchObject({
      allowed: false,
    });

    clock.advance(15 * 60 * 1000);
    await expect(rateLimits.consume({ bucket: 'sign_in', subject })).resolves.toMatchObject({
      allowed: true,
      remaining: 2,
    });
  });

  it('honours a fixed limit the specification states, above the operator cap', async () => {
    const { rateLimits } = harness();
    const subject = { kind: 'number' as const, value: NUMBER };

    const decision = await rateLimits.consume({
      bucket: 'registration',
      subject,
      fixedLimit: 1,
    });

    expect(decision.limit).toBe(1);
    expect(decision.remaining).toBe(0);
    await expect(
      rateLimits.consume({ bucket: 'registration', subject, fixedLimit: 1 }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it('refuses a bucket it has no cap for rather than leaving it unlimited', async () => {
    const { rateLimits } = harness();

    await expect(
      rateLimits.consume({ bucket: 'submission', subject: { kind: 'member', value: 'mbr_x' } }),
    ).rejects.toThrow(/no rate-limit cap/);
  });

  it('reports when the current window ends', async () => {
    const { clock, rateLimits } = harness();
    const decision = await rateLimits.consume({
      bucket: 'sign_in',
      subject: { kind: 'number', value: NUMBER },
    });

    expect(decision.resetAt).toBe('2026-11-18T09:15:00.000Z');
    expect(Date.parse(decision.resetAt)).toBeGreaterThan(clock.now().getTime());
  });
});
