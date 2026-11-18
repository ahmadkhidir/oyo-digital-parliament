/**
 * Identifier generation (`C-001`).
 *
 * Every stored record carries an opaque identifier whose first three lower-case letters name the
 * entity type and whose body is upper-case alphanumeric: `sub_01J9Z6K4Q3W8R2T5Y7B1C0D9EF`. The body
 * is never parsed for meaning, never derived from a person, a counter or a telephone number, and is
 * generated once and reused for the life of the record (`packages/platform/AGENTS.md` Discipline).
 *
 * The prefix is a parameter rather than one method per entity because the existing callers — the
 * audit and analytics boundaries — already ask for `next('aud')` and `next('evt')`, and a use case
 * that needs a new kind should add its prefix in one place, not a new port method everywhere.
 */
export interface IdentifierPort {
  /**
   * Mint one identifier for an entity kind.
   *
   * @param prefix - The three lower-case letters `C-001` assigns to the entity type, for example
   *   `sub`, `mbr`, `dec` or `aud`. An unknown prefix is a programming error, not a user input.
   * @returns The identifier in `C-001` form: prefix, underscore, then an upper-case body.
   */
  next(prefix: string): string;
}

/**
 * The entity prefixes the platform mints.
 *
 * This is the closed vocabulary behind {@link IdentifierPort.next}. It is exported so a use case can
 * name its kind without spelling a literal, and it mirrors the prefixes `CONTRACTS.md` prints for the
 * entities in `schema.md`.
 */
export type IdentifierPrefix =
  | 'wrd'
  | 'mbr'
  | 'prg'
  | 'sic'
  | 'rvd'
  | 'cns'
  | 'stf'
  | 'wdr'
  | 'sub'
  | 'sdr'
  | 'bkg'
  | 'cmt'
  | 'rul'
  | 'mda'
  | 'apl'
  | 'lrv'
  | 'dec'
  | 'ddr'
  | 'com'
  | 'csc'
  | 'dev'
  | 'blm'
  | 'ses'
  | 'rsv'
  | 'sqt'
  | 'rcd'
  | 'wrs'
  | 'wps'
  | 'drq'
  | 'aud'
  | 'mev'
  | 'ntf'
  | 'ntc'
  | 'cus'
  | 'usr'
  | 'tok'
  | 'qwr'
  | 'req';
