/**
 * The identifier factory (`C-001`).
 *
 * The tests pin the encoding, the monotonic rule and the prefix table, and run the shared identifier
 * contract so the production factory and the deterministic double cannot drift.
 */
import { describe, expect, it } from 'vitest';

import { createFixedClock } from '../testing/fixed-clock.ts';
import { createDeterministicIds } from '../testing/deterministic-ids.ts';
import { describeIdentifierContract } from '../testing/contracts.ts';
import {
  CONTRACT_PREFIXES,
  createIdFactory,
  ENTITY_PREFIXES,
  IDENTIFIER_PATTERN,
  isIdentifier,
  TOKEN_PREFIXES,
  type EntityKind,
} from './ids.ts';

/** A random source that returns the given bytes. */
const bytes = (...values: readonly number[]): (() => Uint8Array) => {
  const buffer = new Uint8Array(10);
  values.forEach((value, index) => {
    buffer[index] = value;
  });
  return () => Uint8Array.from(buffer);
};

describe('identifier factory', () => {
  it('encodes the instant and the randomness in Crockford base32', () => {
    const clock = createFixedClock(new Date(0));
    const factory = createIdFactory({ clock, random: () => new Uint8Array(10) });
    expect(factory.next('sub')).toBe('sub_00000000000000000000000000');
  });

  it('mints the C-001 shape with the prefix the kind assigns', () => {
    const factory = createIdFactory({ clock: createFixedClock(), random: bytes(1, 2, 3) });
    const value = factory.next('sub');
    expect(value).toMatch(IDENTIFIER_PATTERN);
    expect(value.startsWith('sub_')).toBe(true);
    expect(value).toHaveLength(30);
  });

  it('refuses a prefix that is not three lower-case letters', () => {
    const factory = createIdFactory({ clock: createFixedClock() });
    expect(() => factory.next('SUB')).toThrow(/three lower-case letters/);
    expect(() => factory.next('sq')).toThrow(/three lower-case letters/);
  });

  it('keeps identifiers ordered when several share a millisecond', () => {
    const clock = createFixedClock();
    const factory = createIdFactory({ clock, random: bytes(9) });
    const first = factory.next('sub');
    const second = factory.next('sub');
    const third = factory.next('sub');
    expect([first, second, third].sort()).toEqual([first, second, third]);
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('keeps ordering when the clock steps backwards', () => {
    const clock = createFixedClock('2026-11-18T09:00:01Z');
    const factory = createIdFactory({ clock, random: bytes(1) });
    const first = factory.next('sub');
    clock.set('2026-11-18T09:00:00Z');
    const second = factory.next('sub');
    expect(second > first).toBe(true);
  });

  it('records one three-letter prefix per kind and never the same prefix twice', () => {
    const recorded = Object.values(CONTRACT_PREFIXES);
    expect(new Set(recorded).size).toBe(recorded.length);
    for (const prefix of recorded) expect(prefix).toMatch(/^[a-z]{3}$/);
  });

  it('holds the complete prefix record C-001 prints', () => {
    // Every row of the `C-001` prefix table, so a prefix added to one side and not the other fails here.
    expect([...Object.values(CONTRACT_PREFIXES)].sort()).toEqual([
      'apl',
      'aud',
      'bkg',
      'blm',
      'cmt',
      'cns',
      'com',
      'csc',
      'cur',
      'cus',
      'ddr',
      'dec',
      'dev',
      'drq',
      'evt',
      'lrv',
      'mbr',
      'mda',
      'mev',
      'ntc',
      'ntf',
      'prg',
      'qwr',
      'rcd',
      'req',
      'rsv',
      'rul',
      'rvd',
      'scd',
      'sdr',
      'ses',
      'sic',
      'sqt',
      'stf',
      'sub',
      'tok',
      'usr',
      'wdr',
      'wps',
      'wrd',
      'wrs',
    ]);
  });

  it('mints every recorded prefix in the C-001 form', () => {
    const factory = createIdFactory({ clock: createFixedClock(), random: bytes(6, 7) });
    for (const prefix of Object.values(CONTRACT_PREFIXES)) {
      const value = factory.next(prefix);
      expect(value).toMatch(IDENTIFIER_PATTERN);
      expect(value.startsWith(`${prefix}_`)).toBe(true);
    }
  });

  it('keeps the kinds a reader could confuse with one another apart', () => {
    expect(CONTRACT_PREFIXES.comment).toBe('cmt');
    expect(CONTRACT_PREFIXES.commitment).toBe('com');
    expect(CONTRACT_PREFIXES.reservation).toBe('rsv');
    expect(CONTRACT_PREFIXES.residenceReview).toBe('rvd');
    expect(CONTRACT_PREFIXES.ward).toBe('wrd');
    expect(CONTRACT_PREFIXES.wardReview).toBe('wdr');
    // C-092: the credential is `scd`; the staff user it belongs to is `stf`.
    expect(CONTRACT_PREFIXES.staffCredential).toBe('scd');
    expect(CONTRACT_PREFIXES.staffUser).toBe('stf');
    expect(CONTRACT_PREFIXES.analyticsEvent).toBe(TOKEN_PREFIXES.analyticsEvent);
    expect(CONTRACT_PREFIXES.pageCursor).toBe(TOKEN_PREFIXES.pageCursor);
  });

  it('names every entity kind in the factory', () => {
    const factory = createIdFactory({ clock: createFixedClock() });
    for (const kind of Object.keys(ENTITY_PREFIXES) as EntityKind[]) {
      expect(factory.generate(kind)).toMatch(IDENTIFIER_PATTERN);
    }
  });

  it('recognises its own output and refuses a malformed value', () => {
    const factory = createIdFactory({ clock: createFixedClock() });
    expect(isIdentifier(factory.next('aud'))).toBe(true);
    expect(isIdentifier('aud_abc')).toBe(false);
    expect(isIdentifier('AUD_01J9Z6K4Q3W8R2T5Y7B1C0D9EF')).toBe(false);
  });
});

describeIdentifierContract('production id factory', () =>
  createIdFactory({ clock: createFixedClock(), random: bytes(4, 2) }),
);

describeIdentifierContract('deterministic id factory', () => createDeterministicIds());
