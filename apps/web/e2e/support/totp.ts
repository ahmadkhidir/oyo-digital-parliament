/**
 * One-time passwords for a test authenticator (`C-092`, `ADR-004`, `NFR-020`).
 *
 * The staff second factor is TOTP; the application verifies it with the platform's own codec
 * (`packages/platform/src/adapters/password/totp.ts`). The enrolment screen shows the shared secret
 * exactly once, so a flow can act as the authenticator app that would scan it: decode the base32
 * secret and compute the RFC 6238 code for the current thirty-second step.
 *
 * This is the standard algorithm, not a copy of the product's verifier: a test that reused the
 * verifier to make a code would prove nothing about whether a real authenticator's code is accepted.
 */
import { createHmac } from 'node:crypto';

/** The base32 alphabet RFC 4648 uses; the product writes secrets in it without padding. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Thirty seconds per step, as `C-092` prints. */
const PERIOD_SECONDS = 30;

/**
 * Decode an unpadded base32 secret.
 *
 * @param text - The secret exactly as the enrolment screen printed it.
 * @returns The shared key's bytes.
 * @throws Error when the text carries a character outside the alphabet.
 */
function decodeBase32(text: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of text.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index === -1) throw new Error('the enrolment secret is not base32');
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >>> bits) & 0xff);
    }
    accumulator &= (1 << bits) - 1;
  }
  return Buffer.from(bytes);
}

/**
 * The six-digit code for one instant.
 *
 * @param secret - The base32 secret from the enrolment screen.
 * @param at - The instant to compute for; defaults to now.
 * @returns The code an authenticator app would show.
 */
export function totpCode(secret: string, at: Date = new Date()): string {
  const step = Math.floor(at.getTime() / 1000 / PERIOD_SECONDS);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}
