/**
 * The Argon2id password hasher (`NFR-021`, `C-092`).
 *
 * The assertions are the ones a reviewer would check by hand: the stored value names Argon2id and a
 * cost of at least 12, two hashes of one password differ, a wrong password is refused, and the
 * no-credential comparison resolves rather than skipping the work `C-092` requires.
 */
import { describe, expect, it } from 'vitest';

import { ARGON2_COST_FLOOR, createArgon2PasswordHasher } from './argon2.ts';

/** The password every assertion uses; long enough for `C-092`'s twelve-character floor. */
const PASSWORD = 'market-lantern-river-2026';

describe('Argon2id password hasher', () => {
  it('stores an Argon2id hash at cost 12 or above and never the password', async () => {
    const hasher = createArgon2PasswordHasher();
    const stored = await hasher.hash(PASSWORD);

    // The encoded form names the algorithm, the version and the parameters, so a weak credential is
    // visible in the table rather than hidden behind an opaque string.
    expect(stored.startsWith('$argon2id$v=19$')).toBe(true);
    const cost = /t=(\d+)/.exec(stored)?.[1];
    expect(Number(cost)).toBeGreaterThanOrEqual(ARGON2_COST_FLOOR);
    expect(stored).not.toContain(PASSWORD);
  });

  it('salts every hash, so two credentials never share a stored value', async () => {
    const hasher = createArgon2PasswordHasher();
    const first = await hasher.hash(PASSWORD);
    const second = await hasher.hash(PASSWORD);
    expect(first).not.toBe(second);
    expect(await hasher.verify(first, PASSWORD)).toBe(true);
    expect(await hasher.verify(second, PASSWORD)).toBe(true);
  });

  it('refuses a wrong password and a hash it did not write', async () => {
    const hasher = createArgon2PasswordHasher();
    const stored = await hasher.hash(PASSWORD);
    expect(await hasher.verify(stored, 'harbour-lantern-quiet-2026')).toBe(false);
    expect(await hasher.verify('not-a-hash', PASSWORD)).toBe(false);
  });

  it('performs a real comparison when no credential matched (C-092)', async () => {
    const hasher = createArgon2PasswordHasher();
    // The point is that it resolves without throwing and does the work; there is no result to read.
    await expect(hasher.verifyWithoutCredential(PASSWORD)).resolves.toBeUndefined();
    await expect(hasher.verifyWithoutCredential('anything-at-all-here')).resolves.toBeUndefined();
  });

  it('refuses a cost below the NFR-021 floor', () => {
    expect(() => createArgon2PasswordHasher({ cost: 11 })).toThrow(/at least 12/);
    expect(() => createArgon2PasswordHasher({ cost: 12.5 })).toThrow(/whole number/);
  });
});
