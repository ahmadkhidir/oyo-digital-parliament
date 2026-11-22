/**
 * The de-identification boundary (`C-078`, `NFR-045`).
 *
 * The load-bearing test is the first: a fully populated caller payload, with every direct
 * identifier the contract names, leaves nothing identifying in the serialised body.
 */
import { describe, expect, it } from 'vitest';

import { deidentify, DIRECT_IDENTIFIER_FIELDS, payloadShapeDigest } from '../index.ts';

describe('deidentify', () => {
  it('withholds every direct identifier before serialisation', () => {
    const input = {
      description: 'Behind Agbowo market, near the express',
      localGovernmentArea: 'Ibadan North',
      candidateLimit: 3,
      fullName: 'Adebayo Ogunlesi',
      telephoneNumber: '+2348031234567',
      displayName: 'Ade',
      memberId: 'mbr_01J9Z5A1B2C3D4E5F6G7H8J9KM',
      authorId: 'mbr_01J9Z5A1B2C3D4E5F6G7H8J9KN',
      moderatorId: 'stf_01J9Z5A1B2C3D4E5F6G7H8J9KP',
      reviewerId: 'stf_01J9Z5A1B2C3D4E5F6G7H8J9KQ',
      requestedById: 'mbr_01J9Z5A1B2C3D4E5F6G7H8J9KR',
      confirmedById: 'mbr_01J9Z5A1B2C3D4E5F6G7H8J9KS',
    };

    const result = deidentify('ward_candidate', input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const serialised = JSON.stringify(result.payload);
    for (const identifier of DIRECT_IDENTIFIER_FIELDS) {
      expect(serialised).not.toContain(identifier);
    }
    expect(serialised).not.toContain('Adebayo');
    expect(serialised).not.toContain('2348031234567');
    expect(serialised).not.toContain('mbr_');
    expect(serialised).not.toContain('stf_');
    expect(result.payload).toEqual({
      description: 'Behind Agbowo market, near the express',
      localGovernmentArea: 'Ibadan North',
      candidateLimit: 3,
    });
    for (const identifier of DIRECT_IDENTIFIER_FIELDS) {
      expect(result.removedFields).toContain(identifier);
    }
  });

  it('assembles from the allow-list, so an upstream field cannot leak by default', () => {
    const result = deidentify('ward_candidate', {
      description: 'Near the primary school',
      wardDescription: 'a description the capability never asked for',
      addressText: '12 Adeoyo Road',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload).toEqual({ description: 'Near the primary school' });
    expect(result.removedFields).toEqual(['addressText', 'wardDescription']);
  });

  it('refuses a description that still carries a telephone number rather than cleaning it', () => {
    const result = deidentify('ward_candidate', {
      description: 'Call me on 0803 123 4567 and I will show you the road',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cause).toBe('IDENTIFIER_PRESENT');
    expect(result.offendingFields).toEqual(['description']);
    expect(JSON.stringify(result)).not.toContain('0803');
  });

  it('refuses a nested value it cannot vouch for', () => {
    const result = deidentify('ward_candidate', {
      description: 'Agbowo',
      localGovernmentArea: { name: 'Ibadan North' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.cause).toBe('UNSAFE_PAYLOAD_VALUE');
    expect(result.offendingFields).toEqual(['localGovernmentArea']);
  });

  it('digests the shape without any value', () => {
    const first = payloadShapeDigest({ b: 'second', a: 'first' });
    const second = payloadShapeDigest({ a: 'a different value', b: 'another value' });

    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first).not.toContain('first');
    expect(first).not.toContain('second');
  });
});
