/**
 * Request fingerprinting (`C-001`: a reused key with a different payload is a conflict).
 *
 * The digest must depend on the payload and not on property order, so two structurally equal bodies
 * produce one value. A change to any field must change it.
 */
import { describe, expect, it } from 'vitest';
import { canonicalJson, fingerprintRequest } from './fingerprint.ts';

describe('fingerprintRequest', () => {
  it('produces the same digest for the same payload in a different key order', () => {
    const first = fingerprintRequest({ reference: 'ODP-004821', type: 'commit' });
    const second = fingerprintRequest({ type: 'commit', reference: 'ODP-004821' });
    expect(first).toBe(second);
  });

  it('changes when any field changes', () => {
    const first = fingerprintRequest({ reference: 'ODP-004821' });
    const second = fingerprintRequest({ reference: 'ODP-004822' });
    expect(first).not.toBe(second);
  });

  it('keeps array order, because a changed order can be a different request', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it('omits undefined properties rather than encoding them differently', () => {
    expect(fingerprintRequest({ a: 1, b: undefined })).toBe(fingerprintRequest({ a: 1 }));
  });

  it('is a lower-case SHA-256 hex digest', () => {
    expect(fingerprintRequest({})).toMatch(/^[0-9a-f]{64}$/);
  });
});
