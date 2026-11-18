/**
 * Time-based one-time codes and recovery codes (`C-092`, `NFR-020`).
 *
 * The second factor the campaign chose is TOTP (ADR-004), so this module is the arithmetic behind it:
 * a fresh base32 secret, the `otpauth://` URI an authenticator scans, the code for one thirty-second
 * step with the one-step tolerance either side that `C-092` prints, and the ten single-use recovery
 * codes issued when enrolment completes.
 *
 * Everything here is a pure function of its arguments. The instant arrives as an argument rather than
 * from the clock, which keeps a code testable against the RFC 6238 vectors and keeps this module out of
 * the ambient-time rule (`packages/platform/AGENTS.md` Discipline).
 *
 * Recovery codes are forty base36 characters' worth of randomness (four groups of four
 * alphanumerics), and are stored only as a digest. They are hashed with SHA-256 rather than Argon2:
 * `NFR-021` fixes Argon2id for passwords, which are chosen by people and therefore guessable, whereas a
 * recovery code is machine-generated at more than 80 bits, so a fast digest is the right tool and keeps
 * a sign-in from spending a second of CPU on ten comparisons.
 *
 * @module adapters/password/totp
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import type {
  SecondFactorPort,
  TotpEnrolmentRequest,
  TotpParameters,
} from '../../../../domain/src/ports/password.ts';

/** The alphabet a TOTP secret is written in: RFC 4648 base32, no padding. */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Twenty random bytes is the RFC 4226 recommendation for an HMAC-SHA1 secret, as 32 base32 characters. */
const SECRET_BYTES = 20;

/** Milliseconds in one second, so an instant and a period are compared in the same unit. */
const MS_PER_SECOND = 1000;

/** The alphabet recovery codes are drawn from. Upper case and digits: readable when copied by hand. */
const RECOVERY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Characters per recovery code, before grouping. Four groups of four, as `C-092` prints them. */
const RECOVERY_CODE_LENGTH = 16;

/** Characters in one printed group. */
const RECOVERY_GROUP = 4;

/** The domain-separation label hashed ahead of a recovery code, so the digest cannot be reused. */
const RECOVERY_CODE_LABEL = 'odp.recovery.v1:';

/** Encode bytes as unpadded upper-case base32. */
function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let accumulator = 0;
  let text = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      text += BASE32[(accumulator >>> bits) & 31] ?? 'A';
    }
    accumulator &= (1 << bits) - 1;
  }
  if (bits > 0) text += BASE32[(accumulator << (5 - bits)) & 31] ?? 'A';
  return text;
}

/** Decode unpadded upper-case base32. A character outside the alphabet makes the secret unusable. */
function base32Decode(text: string): Buffer {
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of text.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(character);
    if (index === -1) throw new Error('the stored second-factor secret is not base32');
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
 * The code for one time step (RFC 4226 dynamic truncation over HMAC-SHA1).
 *
 * @param secret - The decoded shared secret.
 * @param step - The time step, counted from the Unix epoch.
 * @param digits - How many decimal digits to keep.
 */
function codeForStep(secret: Buffer, step: number, digits: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Compare two codes without letting the comparison time depend on where they differ. */
function sameCode(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Create the codec.
 *
 * @returns The port implementation the credential repository receives.
 */
export function createSecondFactorCodec(): SecondFactorPort {
  return {
    generateSecret(): string {
      return base32Encode(randomBytes(SECRET_BYTES));
    },

    otpauthUri(input: TotpEnrolmentRequest & { readonly secret: string }): string {
      // `C-092` prints the label as `issuer:account`, each part percent-encoded and the colon literal,
      // and the query parameters percent-encoded rather than form-encoded, so `%20` is what a reader
      // sees for the space in the issuer's name.
      const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
      const parameters = (
        [
          ['secret', input.secret],
          ['issuer', input.issuer],
          ['algorithm', input.algorithm],
          ['digits', String(input.digits)],
          ['period', String(input.periodSeconds)],
        ] as const
      )
        .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
        .join('&');
      return `otpauth://totp/${label}?${parameters}`;
    },

    verifyCode(
      input: TotpParameters & {
        readonly secret: string;
        readonly code: string;
        readonly at: string;
      },
    ): boolean {
      const instant = Date.parse(input.at);
      if (Number.isNaN(instant)) return false;
      if (!/^[0-9]+$/.test(input.code)) return false;

      let secret: Buffer;
      try {
        secret = base32Decode(input.secret);
      } catch {
        // A stored secret outside base32 cannot produce a matching code. It is refused as a wrong code
        // rather than thrown, so a corrupted row does not answer differently from a wrong guess.
        return false;
      }
      const currentStep = Math.floor(instant / MS_PER_SECOND / input.periodSeconds);

      // Every step in the window is computed even after a match, so a valid code near the edge of the
      // window does not answer faster than an invalid one.
      let matched = false;
      for (let offset = -input.windowSteps; offset <= input.windowSteps; offset += 1) {
        const candidate = codeForStep(secret, currentStep + offset, input.digits);
        if (sameCode(candidate, input.code)) matched = true;
      }
      return matched;
    },

    generateRecoveryCodes(count: number): readonly string[] {
      if (!Number.isInteger(count) || count < 1 || count > 32) {
        throw new Error('a recovery-code batch is between 1 and 32 codes');
      }
      // One draw of `count * 16` characters; each character carries log2(36) bits, so 16 characters is
      // more than 80 bits and a guess is not a threat model the batch has to defend further.
      const bytes = randomBytes(count * RECOVERY_CODE_LENGTH);
      const codes: string[] = [];
      for (let index = 0; index < count; index += 1) {
        let raw = '';
        for (let offset = 0; offset < RECOVERY_CODE_LENGTH; offset += 1) {
          const byte = bytes[index * RECOVERY_CODE_LENGTH + offset] ?? 0;
          // 36 does not divide 256; the modulo bias is under one part in fifty over a byte, and the
          // remaining guess space is still far beyond any attack this code guards against.
          raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length] ?? 'A';
        }
        const groups: string[] = [];
        for (let start = 0; start < RECOVERY_CODE_LENGTH; start += RECOVERY_GROUP) {
          groups.push(raw.slice(start, start + RECOVERY_GROUP));
        }
        codes.push(groups.join('-'));
      }
      return codes;
    },

    hashRecoveryCode(code: string): string {
      const normalised = code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      return createHash('sha256').update(`${RECOVERY_CODE_LABEL}${normalised}`, 'utf8').digest('hex');
    },
  };
}
