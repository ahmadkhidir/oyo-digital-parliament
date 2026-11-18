/**
 * The identifier factory (`C-001`).
 *
 * An identifier is three lower-case letters naming the entity type or identifier kind, an underscore,
 * then a ULID-ordered upper-case body: `sub_01J9Z6K4Q3W8R2T5Y7B1C0D9EF`. The body is time-prefixed,
 * so identifiers sort in creation order without a sequence table; it carries no meaning a caller may
 * parse, and it is never derived from a person, a counter, a telephone number or a record field.
 *
 * `CONTRACTS.md` records one prefix per kind and this module mints exactly that record: a Comment is
 * `cmt` and a Commitment `com`, a Reservation `rsv` and a ResidenceReview `rvd`, a ReportCard `rcd`, a
 * SessionQuestion `sqt`, a staff user `stf` and their credential `scd`, and a queued write `qwr`.
 * {@link ENTITY_PREFIXES} holds the stored record entities and {@link TOKEN_PREFIXES} the kinds that
 * are not record entities — an emitted analytics event and a page cursor; {@link CONTRACT_PREFIXES} is
 * the two together, and the tests assert every prefix in it.
 *
 * Randomness and time are injectable so a test can mint a reproducible identifier, and this module
 * is one of the two places in the package allowed to read the clock or a random source
 * (`packages/platform/AGENTS.md` Discipline).
 *
 * @module ids/ids
 */
import { randomBytes } from 'node:crypto';

import type { ClockPort } from '../../../domain/src/ports/clock.ts';
import type { IdentifierPrefix } from '../../../domain/src/ports/identifiers.ts';

/** The pattern `C-001` prints for a record identifier. */
export const IDENTIFIER_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;

/** The Crockford base32 alphabet a ULID uses. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID length: 10 characters of time and 16 of randomness. */
const ULID_LENGTH = 26;

/**
 * The prefix each entity kind carries.
 *
 * One table, so a new entity kind is one line here and every call site keeps reading the table
 * instead of spelling a literal (`packages/platform/AGENTS.md` Structure).
 */
export const ENTITY_PREFIXES = {
  ward: 'wrd',
  member: 'mbr',
  pendingRegistration: 'prg',
  signInChallenge: 'sic',
  residenceReview: 'rvd',
  consent: 'cns',
  staffUser: 'stf',
  /** `C-092`: the credential a staff user signs in with; one per staff user (`C-001`). */
  staffCredential: 'scd',
  wardReview: 'wdr',
  submission: 'sub',
  submissionDraft: 'sdr',
  backing: 'bkg',
  comment: 'cmt',
  moderationRule: 'rul',
  moderationAction: 'mda',
  appeal: 'apl',
  legalReview: 'lrv',
  decision: 'dec',
  decisionDraft: 'ddr',
  commitment: 'com',
  commitmentStatusChange: 'csc',
  deliveryEvidence: 'dev',
  budgetLineMatch: 'blm',
  session: 'ses',
  reservation: 'rsv',
  sessionQuestion: 'sqt',
  reportCard: 'rcd',
  wardReportSnapshot: 'wrs',
  wardPillarSnapshot: 'wps',
  dataRequest: 'drq',
  auditEvent: 'aud',
  modelEvaluation: 'mev',
  notification: 'ntf',
  publicNotice: 'ntc',
  custodian: 'cus',
  analyticsUser: 'usr',
  pseudonymToken: 'tok',
  queuedWrite: 'qwr',
  correlationRequest: 'req',
} as const satisfies Record<string, IdentifierPrefix>;

/**
 * Identifier kinds `C-001` records that are not stored record entities.
 *
 * An analytics event and a page cursor are still identifiers of the same form — minted once, opaque,
 * ordered — but they name something the platform emits or hands out rather than a row in `schema.md`,
 * so they are recorded separately and not offered as a `generate` kind.
 */
export const TOKEN_PREFIXES = {
  analyticsEvent: 'evt',
  pageCursor: 'cur',
} as const;

/** Every prefix `C-001` records, entity kinds and non-entity kinds together. */
export const CONTRACT_PREFIXES = { ...ENTITY_PREFIXES, ...TOKEN_PREFIXES } as const;

/** One entity kind the factory can name. */
export type EntityKind = keyof typeof ENTITY_PREFIXES;

/** A factory that mints identifiers for the record. */
export interface IdFactory {
  /**
   * Mint one identifier for a prefix in the `C-001` form.
   *
   * @param prefix - Three lower-case letters, one of the values in {@link CONTRACT_PREFIXES}. An
   *   unknown prefix is a programming defect and throws.
   */
  next(prefix: string): string;
  /** Mint one identifier for a known entity kind, without spelling its prefix. */
  generate(kind: EntityKind): string;
}

/** What the factory needs besides the clock. */
export interface IdFactoryOptions {
  readonly clock: ClockPort;
  /**
   * Exactly ten random bytes.
   *
   * Injectable so a test is reproducible; production uses `crypto.randomBytes`, which is a CSPRNG
   * and never `Math.random`.
   */
  readonly random?: () => Uint8Array;
}

/** Encode an integer into Crockford base32, most significant digit first. */
function encode(value: number, length: number): string {
  let remaining = value;
  const digits: string[] = [];
  for (let index = 0; index < length; index += 1) {
    digits.unshift(CROCKFORD[remaining % 32] ?? '0');
    remaining = Math.floor(remaining / 32);
  }
  return digits.join('');
}

/** Encode ten random bytes as sixteen Crockford characters. */
function encodeRandomness(bytes: Uint8Array): string {
  let text = '';
  let accumulator = 0;
  let bits = 0;
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      text += CROCKFORD[(accumulator >>> bits) & 31] ?? '0';
    }
    accumulator &= (1 << bits) - 1;
  }
  if (bits > 0) text += CROCKFORD[(accumulator << (5 - bits)) & 31] ?? '0';
  return text.slice(0, 16);
}

/** Add one to an 80-bit randomness buffer, for the monotonic-within-a-millisecond case. */
function incrementRandomness(bytes: Uint8Array): Uint8Array {
  const next = Uint8Array.from(bytes);
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const value = (next[index] ?? 0) + 1;
    next[index] = value & 0xff;
    if (value <= 0xff) return next;
  }
  // Every byte overflowed: the caller has minted 2^80 identifiers in one millisecond.
  throw new Error('identifier randomness exhausted within one millisecond');
}

/**
 * Create an identifier factory.
 *
 * Within one millisecond the randomness is incremented rather than redrawn, so identifiers minted in
 * a batch are strictly ordered and cannot collide. A new millisecond draws fresh randomness.
 *
 * @param options - The injected clock and random source.
 */
export function createIdFactory(options: IdFactoryOptions): IdFactory {
  const draw = options.random ?? (() => new Uint8Array(randomBytes(10)));
  let lastTime = -1;
  let lastRandomness: Uint8Array | null = null;

  const ulid = (): string => {
    const instant = options.clock.now().getTime();
    if (instant < 0 || instant > 0xffffffffffff) {
      throw new Error('clock produced an instant outside the ULID range');
    }

    // A clock that steps backwards must not reorder identifiers: keep the last timestamp and
    // increment the randomness, which is the monotonic-within-a-millisecond rule.
    const time = lastTime >= 0 && instant <= lastTime ? lastTime : instant;

    let randomness: Uint8Array;
    if (lastRandomness !== null && instant <= lastTime) {
      randomness = incrementRandomness(lastRandomness);
    } else {
      randomness = draw();
      if (randomness.length !== 10) {
        throw new Error('identifier randomness must be exactly ten bytes');
      }
    }

    lastTime = time;
    lastRandomness = randomness;
    return `${encode(time, 10)}${encodeRandomness(randomness)}`.slice(0, ULID_LENGTH);
  };

  return {
    next(prefix: string): string {
      if (!/^[a-z]{3}$/.test(prefix)) {
        throw new Error(`identifier prefix must be three lower-case letters, received "${prefix}"`);
      }
      return `${prefix}_${ulid()}`;
    },
    generate(kind: EntityKind): string {
      return `${ENTITY_PREFIXES[kind]}_${ulid()}`;
    },
  };
}

/**
 * Whether a value has the `C-001` identifier shape.
 *
 * Used where an identifier arrives from a caller or a stored record; it proves the shape, not the
 * existence of the record.
 */
export function isIdentifier(value: string): boolean {
  return IDENTIFIER_PATTERN.test(value);
}
