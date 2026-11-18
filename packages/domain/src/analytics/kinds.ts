/**
 * The value kinds an analytics property may be declared as (`C-089`, `analytics.md` Event Taxonomy).
 *
 * The taxonomy is a closed vocabulary of *names* and *shapes*. There is deliberately no `text` kind:
 * no analytics property can hold prose, an address, a ward description or a submission excerpt,
 * because no kind accepts whitespace-bearing text. A property whose value needs to be described in
 * words is the wrong property for this envelope.
 *
 * Wire values are JSON scalars only (`string | number | boolean`). A nested object or array is
 * rejected at validation, so a caller cannot smuggle a free-text blob through a structured property.
 */

/** A property's declared value domain. */
export type AnalyticsPropertyKind =
  | { readonly type: 'boolean' }
  | { readonly type: 'integer'; readonly min: number; readonly max?: number }
  | { readonly type: 'enum'; readonly values: readonly string[] }
  | { readonly type: 'token'; readonly maxLength: number }
  | { readonly type: 'identifier'; readonly prefix: string }
  | { readonly type: 'quarter' };

/**
 * The kinds permitted for a declared payload value. Used as a mapped constraint so declaring
 * `signed_in: string` with a boolean kind, or `days_overdue: string` with an integer kind, fails to
 * compile rather than failing at run time on a live event.
 *
 * Comparisons are wrapped in tuples so a union value such as `'en-NG' | 'yo-NG'` resolves to the
 * string kinds instead of distributing across the conditional.
 */
export type KindFor<V> = [V] extends [boolean]
  ? { readonly type: 'boolean' }
  : [V] extends [number]
    ? { readonly type: 'integer'; readonly min: number; readonly max?: number }
    : [V] extends [string]
      ? Extract<AnalyticsPropertyKind, { type: 'enum' | 'token' | 'identifier' | 'quarter' }>
      : never;

/** A boolean flag. */
export function booleanKind(): { readonly type: 'boolean' } {
  return { type: 'boolean' };
}

/** A whole number in a stated band. `max` is omitted where the specification sets no ceiling. */
export function integerKind(
  min: number,
  max?: number,
): { readonly type: 'integer'; readonly min: number; readonly max?: number } {
  return max === undefined ? { type: 'integer', min } : { type: 'integer', min, max };
}

/** One of a closed set of values, spelled exactly as `schema.md` or `CONTRACTS.md` spells them. */
export function enumKind(values: readonly string[]): { readonly type: 'enum'; readonly values: readonly string[] } {
  return { type: 'enum', values };
}

/**
 * A stable lower-case code: `reason_code`, `rule_code`, `failure_code`, a device class, a screen id.
 * The pattern forbids spaces, so a token can never carry a sentence.
 */
export function tokenKind(maxLength = 60): { readonly type: 'token'; readonly maxLength: number } {
  return { type: 'token', maxLength };
}

/** A record identifier in the `C-001` form: a three-letter prefix, an underscore, a Crockford id. */
export function identifierKind(prefix: string): { readonly type: 'identifier'; readonly prefix: string } {
  return { type: 'identifier', prefix };
}

/** A quarter in the `schema.md` form, `YYYY-QN`. */
export function quarterKind(): { readonly type: 'quarter' } {
  return { type: 'quarter' };
}
