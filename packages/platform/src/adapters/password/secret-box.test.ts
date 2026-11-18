/**
 * The TOTP secret seal (`NFR-024`, `C-092`).
 *
 * The secret is the one value in the credential table that must be unreadable at rest. These tests
 * prove the round trip, that two seals differ, and that a value tampered with, wrongly keyed or
 * truncated is refused rather than decrypted.
 */
import { describe, expect, it } from 'vitest';

import { createTotpSecretBox, decodeSecretKey, SECRET_KEY_BYTES } from './secret-box.ts';

/** Two disposable 32-byte keys. Neither is a real credential. */
const KEY = Buffer.from('odp-test-totp-key-0123456789abcd').toString('base64');
const OTHER_KEY = Buffer.from('odp-test-totp-key-9876543210wxyz').toString('base64');

/** The secret an authenticator would hold for a test account. */
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

describe('second-factor secret box', () => {
  it('round-trips the secret without storing it in clear', () => {
    const box = createTotpSecretBox(KEY);
    const sealed = box.seal(SECRET);

    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain(SECRET);
    expect(box.open(sealed)).toBe(SECRET);
  });

  it('draws a fresh nonce, so one secret seals differently each time', () => {
    const box = createTotpSecretBox(KEY);
    expect(box.seal(SECRET)).not.toBe(box.seal(SECRET));
  });

  it('refuses a tampered value instead of returning plaintext', () => {
    const box = createTotpSecretBox(KEY);
    const sealed = box.seal(SECRET);
    const [version, payload = ''] = sealed.split('.');
    const bytes = Buffer.from(payload, 'base64');
    // Flip one bit of the ciphertext, leaving the format and the tag in place.
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 0x01;

    expect(() => box.open(`${version}.${bytes.toString('base64')}`)).toThrow(/failed authentication/);
  });

  it('refuses a value sealed under another key', () => {
    const sealed = createTotpSecretBox(KEY).seal(SECRET);
    expect(() => createTotpSecretBox(OTHER_KEY).open(sealed)).toThrow(/failed authentication/);
  });

  it('refuses a value it did not write', () => {
    const box = createTotpSecretBox(KEY);
    expect(() => box.open(SECRET)).toThrow(/sealed format/);
    expect(() => box.open('v2.AAAA')).toThrow(/sealed format/);
    expect(() => box.open('v1.AAAA')).toThrow(/truncated/);
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => decodeSecretKey(Buffer.from('too-short').toString('base64'))).toThrow(
      new RegExp(`exactly ${SECRET_KEY_BYTES} bytes`),
    );
    expect(() => createTotpSecretBox('not base64 at all!!')).toThrow(/32 bytes/);
  });
});
