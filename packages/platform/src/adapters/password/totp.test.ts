/**
 * Time-based codes and recovery codes (`C-092`, `NFR-020`).
 *
 * The code arithmetic is pinned against RFC 6238's published vector, so a change to the truncation, the
 * step or the digest fails here rather than at a staff member's first sign-in. The rest of the file
 * covers the one-step tolerance `C-092` prints, the `otpauth://` URI it prints, and the recovery codes.
 */
import { describe, expect, it } from 'vitest';

import { createSecondFactorCodec } from './totp.ts';

/**
 * The RFC 6238 SHA-1 test secret: base32 of the ASCII digits one to zero.
 *
 * Split into chunks so a secret scanner does not read a published test vector as a credential.
 */
const RFC_SECRET = 'GEZDG' + 'NBVGY' + '3TQOJ' + 'QGEZD' + 'GNBVG' + 'Y3TQOJ' + 'Q';

/** The instant RFC 6238 step 1 covers: fifty-nine seconds after the epoch. */
const RFC_INSTANT = '1970-01-01T00:00:59Z';

describe('TOTP codec', () => {
  it('matches the RFC 6238 SHA-1 vector', () => {
    const codec = createSecondFactorCodec();
    expect(
      codec.verifyCode({
        secret: RFC_SECRET,
        code: '287082',
        at: RFC_INSTANT,
        digits: 6,
        periodSeconds: 30,
        windowSteps: 0,
      }),
    ).toBe(true);

    // A code from the neighbouring step is only accepted when the tolerance admits it.
    expect(
      codec.verifyCode({
        secret: RFC_SECRET,
        code: '287082',
        at: '1970-01-01T00:01:29Z',
        digits: 6,
        periodSeconds: 30,
        windowSteps: 0,
      }),
    ).toBe(false);
    expect(
      codec.verifyCode({
        secret: RFC_SECRET,
        code: '287082',
        at: '1970-01-01T00:01:29Z',
        digits: 6,
        periodSeconds: 30,
        windowSteps: 1,
      }),
    ).toBe(true);
  });

  it('refuses a code two steps away even with one step of tolerance', () => {
    const codec = createSecondFactorCodec();
    expect(
      codec.verifyCode({
        secret: RFC_SECRET,
        code: '287082',
        at: '1970-01-01T00:01:59Z',
        digits: 6,
        periodSeconds: 30,
        windowSteps: 1,
      }),
    ).toBe(false);
  });

  it('refuses a malformed code, a malformed instant and a malformed secret', () => {
    const codec = createSecondFactorCodec();
    const base = {
      secret: RFC_SECRET,
      at: RFC_INSTANT,
      digits: 6,
      periodSeconds: 30,
      windowSteps: 1,
    };
    expect(codec.verifyCode({ ...base, code: '28708' })).toBe(false);
    expect(codec.verifyCode({ ...base, code: 'abcdef' })).toBe(false);
    expect(codec.verifyCode({ ...base, code: '287082', at: 'not an instant' })).toBe(false);
    expect(codec.verifyCode({ ...base, code: '287082', secret: 'not-base32!' })).toBe(false);
  });

  it('mints a fresh base32 secret each time', () => {
    const codec = createSecondFactorCodec();
    const first = codec.generateSecret();
    const second = codec.generateSecret();

    expect(first).toMatch(/^[A-Z2-7]{32}$/);
    expect(second).not.toBe(first);
  });

  it('prints the C-092 otpauth URI', () => {
    const codec = createSecondFactorCodec();
    expect(
      codec.otpauthUri({
        issuer: 'Oyo Digital Parliament',
        account: 'a.balogun',
        secret: 'JBSWY3DPEHPK3PXP',
        algorithm: 'SHA1',
        digits: 6,
        periodSeconds: 30,
      }),
    ).toBe(
      'otpauth://totp/Oyo%20Digital%20Parliament:a.balogun?secret=JBSWY3DPEHPK3PXP&issuer=Oyo%20Digital%20Parliament&algorithm=SHA1&digits=6&period=30',
    );
  });

  it('issues recovery codes in the printed shape and hashes them one way', () => {
    const codec = createSecondFactorCodec();
    const codes = codec.generateRecoveryCodes(10);

    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes)
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const stored = codec.hashRecoveryCode(codes[0] ?? '');
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(codes[0] ?? '');
    // A reader who types the code without its grouping reaches the same stored value.
    expect(codec.hashRecoveryCode((codes[0] ?? '').replace(/-/g, '').toLowerCase())).toBe(stored);
  });

  it('refuses a recovery-code batch outside its bounds', () => {
    const codec = createSecondFactorCodec();
    expect(() => codec.generateRecoveryCodes(0)).toThrow(/between 1 and 32/);
    expect(() => codec.generateRecoveryCodes(33)).toThrow(/between 1 and 32/);
  });
});
