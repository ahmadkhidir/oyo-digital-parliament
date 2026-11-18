/**
 * The Argon2id password hasher (`NFR-021`, `C-092`).
 *
 * `NFR-021` fixes one algorithm for staff credentials: Argon2id at cost 12 or above, and nothing
 * reversible. This adapter is the only place a staff password is hashed, and the only place the encoded
 * hash is read; the domain decides the length bounds and receives a boolean, never the hash.
 *
 * **Cost.** Argon2 calls the number of passes the *cost*: `timeCost`. This adapter pins it at 12, the
 * floor `NFR-021` fixes, with the OWASP-recommended 19 MiB of memory and one lane. Raising the cost is a
 * deliberate change here; lowering it fails the module's own guard, so a deployment cannot quietly
 * weaken the stored credential.
 *
 * **Unknown usernames.** `C-092` requires an unknown username and a wrong password to take the same
 * work, so {@link PasswordHasherPort.verifyWithoutCredential} runs one real comparison against a hash
 * this adapter minted for a password no one knows. The dummy hash is computed once, lazily, so the
 * first unknown username pays for it and every later one pays only a comparison.
 *
 * No password, hash or salt is logged, thrown or retained by this module.
 *
 * @module adapters/password/argon2
 */
import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';

import type { PasswordHasherPort } from '../../../../domain/src/ports/password.ts';

/**
 * `Algorithm.Argon2id`. The binding declares it as an ambient const enum, which `verbatimModuleSyntax`
 * forbids reading at runtime; the member's value is fixed by the Argon2 reference implementation and is
 * asserted by the encoded hash the tests read back (`$argon2id$`).
 */
const ARGON2ID = 2 as Algorithm;

/** The cost floor `NFR-021` fixes. A lower value is rejected at construction. */
export const ARGON2_COST_FLOOR = 12;

/** Memory in kibibytes: the OWASP Argon2id baseline, 19 MiB. */
export const ARGON2_MEMORY_KIB = 19_456;

/** Lanes. One keeps a single sign-in from competing with itself for CPU. */
export const ARGON2_PARALLELISM = 1;

/** Options for {@link createArgon2PasswordHasher}. */
export interface Argon2PasswordHasherOptions {
  /**
   * Passes over memory. Defaults to {@link ARGON2_COST_FLOOR}; anything below it throws, because
   * `NFR-021` states the floor rather than a suggestion.
   */
  readonly cost?: number;
}

/** The plaintext the dummy hash is minted from. Never compared against a supplied password directly. */
const UNKNOWN_CREDENTIAL_PASSWORD = 'odp-unknown-credential-placeholder';

/**
 * Create the hasher.
 *
 * @param options - The cost, defaulting to the `NFR-021` floor.
 * @returns The port implementation the composition root hands to `@odp/domain`.
 * @throws when the requested cost is below the floor or not a whole number.
 */
export function createArgon2PasswordHasher(
  options: Argon2PasswordHasherOptions = {},
): PasswordHasherPort {
  const cost = options.cost ?? ARGON2_COST_FLOOR;
  if (!Number.isInteger(cost) || cost < ARGON2_COST_FLOOR) {
    throw new Error(
      `the Argon2id cost must be a whole number of at least ${ARGON2_COST_FLOOR} (NFR-021)`,
    );
  }

  const parameters = {
    algorithm: ARGON2ID,
    timeCost: cost,
    memoryCost: ARGON2_MEMORY_KIB,
    parallelism: ARGON2_PARALLELISM,
  } as const;

  let dummyHash: Promise<string> | null = null;

  return {
    async hash(password: string): Promise<string> {
      return hash(password, parameters);
    },

    async verify(passwordHash: string, password: string): Promise<boolean> {
      try {
        return await verify(passwordHash, password);
      } catch {
        // A hash this adapter did not write is refused, not thrown: the caller must answer "wrong
        // password" rather than expose that a stored value is corrupt.
        return false;
      }
    },

    async verifyWithoutCredential(password: string): Promise<void> {
      dummyHash ??= hash(UNKNOWN_CREDENTIAL_PASSWORD, parameters);
      const stored = await dummyHash;
      try {
        await verify(stored, password);
      } catch {
        // The result is discarded: only the work matters, and no caller learns anything from it.
      }
    },
  };
}
