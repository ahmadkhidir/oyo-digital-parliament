/**
 * The identifier factory (`C-001`).
 *
 * An identifier is three lower-case letters naming the entity type, an underscore, then a
 * ULID-ordered upper-case body: `sub_01J9Z6K4Q3W8R2T5Y7B1C0D9EF`. The body is time-prefixed, so
 * identifiers sort in creation order without a sequence table; it carries no meaning a caller may
 * parse, and it is never derived from a person, a counter, a telephone number or a record field.
 *
 * Randomness and time are injectable so a test can mint a reproducible identifier, and this module
 * is one of the two places in the package allowed to read the clock or a random source
 * (`packages/platform/AGENTS.md` Discipline).
 *
 * Two decisions are recorded here because `CONTRACTS.md` contradicts its own identifier pattern:
 *
 * - `C-001` fixes `^[a-z]{3}_[0-9A-Z]{4,26}$`, while `C-063` prints `sq_…` for a SessionQuestion and
 *   `C-001` itself prints `qw_…` for a queued write. This factory mints `sqt` and `qwr`, because a
 *   two-letter prefix cannot satisfy the pattern every caller validates against.
 * - `C-043` prints `cmt_…` for a Commitment and `C-019` prints `cmt_…` for a Comment. This factory
 *   keeps `cmt` for Comment and mints `com` for Commitment, because a prefix that names two entity
 *   types cannot be read as "the prefix names the entity type".
 *
 * Both are reported as contract change requests; nothing here silently departs from the pattern.
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

/** One entity kind the factory can name. */
export type EntityKind = keyof typeof ENTITY_PREFIXES;

/** A factory that mints identifiers for the record. */
export interface IdFactory {
  /**
   * Mint one identifier for a prefix in the `C-001` form.
   *
   * @param prefix - Three lower-case letters. An unknown prefix is a programming defect and throws.
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
