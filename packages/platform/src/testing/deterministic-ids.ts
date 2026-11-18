/**
 * The identifier double.
 *
 * Deterministic and readable: the body is a zero-padded base-36 counter, so an assertion can name
 * the second submission a test published. It implements the same `IdentifierPort` shape and the same
 * prefix table as the production factory, so a test that switches to the real factory keeps its
 * prefix expectations.
 *
 * @module testing/deterministic-ids
 */
import type { IdentifierPort } from '../../../domain/src/ports/identifiers.ts';
import { ENTITY_PREFIXES, type EntityKind, type IdFactory } from '../ids/ids.ts';

/** A factory that counts instead of drawing randomness. */
export interface DeterministicIds extends IdFactory {
  /** How many identifiers have been minted. */
  readonly count: number;
  /** Reset the counter, for a test that reuses one fixture. */
  reset(): void;
}

/** Encode a counter as a 26-character upper-case base-36 body. */
function bodyFor(counter: number): string {
  return counter.toString(36).toUpperCase().padStart(26, '0');
}

/**
 * Create the deterministic factory.
 *
 * @param start - The first counter value. Defaults to 1.
 */
export function createDeterministicIds(start = 1): DeterministicIds {
  let counter = start;

  const factory: DeterministicIds = {
    get count() {
      return counter - start;
    },
    reset() {
      counter = start;
    },
    next(prefix: string): string {
      if (!/^[a-z]{3}$/.test(prefix)) {
        throw new Error(`identifier prefix must be three lower-case letters, received "${prefix}"`);
      }
      const value = `${prefix}_${bodyFor(counter)}`;
      counter += 1;
      return value;
    },
    generate(kind: EntityKind): string {
      return factory.next(ENTITY_PREFIXES[kind]);
    },
  };

  return factory;
}

/** The identifier port over the deterministic factory, for a use case that only needs `next`. */
export function identifierPortOf(factory: DeterministicIds): IdentifierPort {
  return { next: (prefix) => factory.next(prefix) };
}
