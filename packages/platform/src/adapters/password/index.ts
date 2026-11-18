/**
 * The credential-material adapters, built from the validated configuration.
 *
 * One place turns `STAFF_TOTP_SECRET_KEY` and the `NFR-021` hashing parameters into the three ports the
 * staff credential repository needs, so the composition root wires one bundle instead of three
 * constructions that could drift apart (`packages/platform/AGENTS.md` Structure).
 *
 * The key is validated twice on purpose: the configuration schema refuses a value that is not base64 of
 * 32 bytes at boot, and {@link createTotpSecretBox} refuses it again for a caller that constructs this
 * bundle directly. A missing or malformed key is a failed boot, never a weaker seal.
 *
 * @module adapters/password
 */
import type {
  PasswordHasherPort,
  SecondFactorPort,
  TotpSecretCipherPort,
} from '../../../../domain/src/ports/password.ts';
import type { CredentialsConfig } from '../../config/load.ts';
import { createArgon2PasswordHasher, type Argon2PasswordHasherOptions } from './argon2.ts';
import { createTotpSecretBox } from './secret-box.ts';
import { createSecondFactorCodec } from './totp.ts';

export { ARGON2_COST_FLOOR, createArgon2PasswordHasher } from './argon2.ts';
export { createSecondFactorCodec } from './totp.ts';
export { createTotpSecretBox, decodeSecretKey, SECRET_KEY_BYTES } from './secret-box.ts';

/** The three credential ports the staff sign-in rules reach through the repository. */
export interface CredentialAdapters {
  readonly hasher: PasswordHasherPort;
  readonly cipher: TotpSecretCipherPort;
  readonly secondFactor: SecondFactorPort;
}

/**
 * Build the credential adapters.
 *
 * @param config - The `credentials` slice of the validated configuration.
 * @param options - The hashing cost, defaulting to the `NFR-021` floor.
 * @returns The three ports, each holding the key or the parameters it needs and nothing else.
 */
export function createCredentialAdapters(
  config: CredentialsConfig,
  options: Argon2PasswordHasherOptions = {},
): CredentialAdapters {
  return {
    hasher: createArgon2PasswordHasher(options),
    cipher: createTotpSecretBox(config.totpSecretKey),
    secondFactor: createSecondFactorCodec(),
  };
}
