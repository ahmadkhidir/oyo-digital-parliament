/**
 * Sealing the second factor's shared secret at rest (`NFR-024`, `C-092`).
 *
 * `schema.md` stores `StaffCredential.totpSecretEncrypted` as one text value: the TOTP secret is shown
 * once at enrolment and never returned again, so the stored copy only has to be useless to anyone who
 * reads the table. AES-256-GCM under a key from the validated configuration does that, and the
 * authentication tag means a tampered value is refused rather than decrypted into something else.
 *
 * **Format.** `v1.<base64(iv || tag || ciphertext)>`. The version prefix lets a future key wrap or
 * cipher change read old rows; the nonce is fresh per seal, so two seals of one secret differ and a
 * reader cannot tell from the table that two credentials share a secret.
 *
 * **Key.** Exactly 32 bytes, base64, validated by the configuration schema at boot
 * (`STAFF_TOTP_SECRET_KEY`). This module re-checks the length because a caller can construct it
 * directly in a test or a script; a short key fails here rather than producing a weak seal.
 *
 * No plaintext secret, nonce or key appears in an error message or a log line.
 *
 * @module adapters/password/secret-box
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { TotpSecretCipherPort } from '../../../../domain/src/ports/password.ts';

/** The format marker written ahead of every sealed value. */
const FORMAT_VERSION = 'v1';

/** AES-256-GCM's nonce length, in bytes. Twelve is the size GCM is specified for. */
const NONCE_BYTES = 12;

/** The GCM authentication tag length, in bytes. */
const TAG_BYTES = 16;

/** The only key length AES-256 accepts. */
export const SECRET_KEY_BYTES = 32;

/**
 * Turn the configured key into bytes.
 *
 * @param encodedKey - Base64 text from the configuration.
 * @returns The 32-byte key.
 * @throws when the value is not valid base64 or does not decode to 32 bytes. The message names the
 *   requirement and never the value (`NFR-024`).
 */
export function decodeSecretKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== SECRET_KEY_BYTES) {
    throw new Error(
      `STAFF_TOTP_SECRET_KEY must decode to exactly ${SECRET_KEY_BYTES} bytes; it is a secret and its value is never printed (NFR-024)`,
    );
  }
  return key;
}

/**
 * Create the cipher over one key.
 *
 * @param encodedKey - The base64 key from `config.credentials.totpSecretKey`.
 * @returns The port implementation the credential repository receives.
 * @throws when the key is the wrong length — a failed boot, never a weak seal.
 */
export function createTotpSecretBox(encodedKey: string): TotpSecretCipherPort {
  const key = decodeSecretKey(encodedKey);

  return {
    seal(secret: string): string {
      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, nonce);
      const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `${FORMAT_VERSION}.${Buffer.concat([nonce, tag, ciphertext]).toString('base64')}`;
    },

    open(sealed: string): string {
      const [version, payload] = sealed.split('.');
      if (version !== FORMAT_VERSION || payload === undefined) {
        throw new Error('the stored second-factor secret is not in the current sealed format');
      }

      const bytes = Buffer.from(payload, 'base64');
      if (bytes.length <= NONCE_BYTES + TAG_BYTES) {
        throw new Error('the stored second-factor secret is truncated');
      }

      const nonce = bytes.subarray(0, NONCE_BYTES);
      const tag = bytes.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
      const ciphertext = bytes.subarray(NONCE_BYTES + TAG_BYTES);

      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAuthTag(tag);
      try {
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
      } catch {
        // A wrong key or a modified value fails the tag. The caller reports the store as unavailable;
        // it never receives partially decrypted material.
        throw new Error('the stored second-factor secret failed authentication');
      }
    },
  };
}
