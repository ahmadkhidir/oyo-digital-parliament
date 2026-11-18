/**
 * The session key scheme (`NFR-026`, `NFR-027`).
 *
 * A key is the one place a personal value could leak into Redis, so the suite proves the shape and the
 * refusals: a raw token, a telephone number or free text never reaches a key.
 */
import { describe, expect, it } from 'vitest';

import {
  digestSessionToken,
  digestSubject,
  rateLimitKey,
  sessionKey,
  staffSessionIndexKey,
  verificationAttemptsKey,
  verificationCodeKey,
  verificationCooldownKey,
} from './keys.ts';

const TOKEN = '9Wq3m0Zk1yV8sR2tB6cN4fH7jL5pX0aD3eG1kM9uQ2w';

describe('session keys', () => {
  it('separates the two namespaces and carries the token digest only', () => {
    const digest = digestSessionToken(TOKEN);
    const member = sessionKey('member', digest);
    const staff = sessionKey('staff', digest);

    expect(member).toBe(`odp:v1:sess:member:${digest}`);
    expect(staff).toBe(`odp:v1:sess:staff:${digest}`);
    expect(member).not.toContain(TOKEN);
  });

  it('refuses to build a session key from the token itself', () => {
    expect(() => sessionKey('member', TOKEN)).toThrow(/digest/);
  });

  it('indexes staff sessions by staff identifier only', () => {
    expect(staffSessionIndexKey('stf_01J9Z4C8D1E2F3G4H5J6K7M8NP')).toBe(
      'odp:v1:sess:staff-index:stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
    );
    expect(() => staffSessionIndexKey('+2348031234567')).toThrow(/staff identifier/);
  });

  it('binds a code to a pending registration or challenge identifier, never a number', () => {
    const pending = 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9';
    const challenge = 'sic_01J9Z6R4F7H2J9K1L3M5N7P0Q2';

    expect(verificationCodeKey(pending)).toBe(`odp:v1:otp:code:${pending}`);
    expect(verificationAttemptsKey(challenge)).toBe(`odp:v1:otp:attempts:${challenge}`);
    expect(verificationCooldownKey(pending)).toBe(`odp:v1:otp:cooldown:${pending}`);
    expect(() => verificationCodeKey('+2348031234567')).toThrow(/record identifier/);
  });
});

describe('rate-limit keys and digests', () => {
  const digest = digestSubject({ kind: 'number', value: '+2348031234567' });

  it('builds a key from the bucket, the digest and the window index', () => {
    expect(rateLimitKey('sign_in', digest, 1234)).toBe(`odp:v1:limit:sign_in:${digest}:1234`);
  });

  it('refuses a key that would carry the subject or free text', () => {
    expect(() => rateLimitKey('Sign In', digest, 1)).toThrow(/lower-snake/);
    expect(() => rateLimitKey('sign_in', '+2348031234567', 1)).toThrow(/digest/);
  });

  it('digests the subject one way, separated by kind', () => {
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain('2348031234567');
    expect(digestSubject({ kind: 'number', value: '+2348031234567' })).toBe(digest);
    expect(digestSubject({ kind: 'address', value: '+2348031234567' })).not.toBe(digest);
  });

  it('uses a keyed digest when a secret is configured', () => {
    const keyed = digestSubject({ kind: 'number', value: '+2348031234567' }, 'operator-secret');

    expect(keyed).toMatch(/^[0-9a-f]{64}$/);
    expect(keyed).not.toBe(digest);
    expect(digestSubject({ kind: 'number', value: '+2348031234567' }, 'operator-secret')).toBe(
      keyed,
    );
  });

  it('refuses an empty subject', () => {
    expect(() => digestSubject({ kind: 'number', value: '' })).toThrow(/value/);
  });
});
