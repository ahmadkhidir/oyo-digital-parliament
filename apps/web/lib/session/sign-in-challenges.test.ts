/**
 * The sign-in challenge store's tests (`C-005`, `C-006`).
 *
 * The store runs over the platform's memory cache double, so the same rules the Redis adapter
 * enforces — mandatory expiry, a miss is `null`, an atomic delete — hold here too. Each test
 * names the contract line it exercises.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryCache, createFixedClock } from '@odp/platform/testing';
import { createSignInChallengeStore } from './sign-in-challenges';

const NOW = '2026-11-18T09:00:00Z';
const LATER = '2026-11-18T09:10:00Z'; // The challenge's own window: ten minutes (`C-005`).

function store() {
  const cache = createMemoryCache({ clock: createFixedClock(new Date(NOW)) });
  return { cache, store: createSignInChallengeStore(cache) };
}

const input = {
  id: 'sic_TEST00000000000000000001',
  telephoneNumber: '+2348031234567',
  memberIds: ['mbr_0001', 'mbr_0002'],
  at: NOW,
  expiresAt: LATER,
};

describe('createSignInChallengeStore (C-005, C-006)', () => {
  it('stores a challenge with the number out of the key, and reads it back whole', async () => {
    const { cache, store: challenges } = store();

    const { attempt } = await challenges.create(input);
    expect(attempt).toBe(1);

    // No key carries a telephone number: the record is keyed by the opaque challenge id, and the
    // attempt counter by a digest (`packages/platform/AGENTS.md` Discipline).
    expect(cache.keys().every((key) => !key.includes('+234'))).toBe(true);

    const read = await challenges.findById(input.id);
    expect(read).toEqual({
      id: input.id,
      telephoneNumber: '+2348031234567',
      memberIds: ['mbr_0001', 'mbr_0002'],
      codeSentAt: NOW,
      expiresAt: LATER,
    });
  });

  it('counts the attempts a number has made, from a digest key', async () => {
    const { store: challenges } = store();
    await challenges.create(input);
    const second = await challenges.create(input);
    expect(second.attempt).toBe(2);
  });

  it('answers null for an unknown challenge', async () => {
    const { store: challenges } = store();
    expect(await challenges.findById('sic_MISSING00000000000000001')).toBeNull();
  });

  it('expires the challenge with its own window, so a late code is unknown', async () => {
    const { cache, store: challenges } = store();
    await challenges.create(input);

    // Past `expiresAt` the record is gone, exactly as `C-006`'s `NOT_FOUND` expects.
    cache.clock.set(new Date('2026-11-18T09:10:01Z'));
    expect(await challenges.findById(input.id)).toBeNull();
  });

  it('consumes a challenge exactly once, so a replayed code cannot open a second session', async () => {
    const { store: challenges } = store();
    await challenges.create(input);

    expect(await challenges.consume(input.id, NOW)).toBe(true);
    expect(await challenges.consume(input.id, NOW)).toBe(false);
    expect(await challenges.findById(input.id)).toBeNull();
  });
});
