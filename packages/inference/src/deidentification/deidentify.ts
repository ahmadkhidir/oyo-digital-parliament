/**
 * The de-identification boundary (`C-078`, `NFR-045`).
 *
 * The outbound payload is assembled from the capability's allow-list, so an upstream field cannot
 * leak by default. A direct identifier is omitted and reported in `removedFields`; where structure
 * forces a value, a constant is substituted. A value that still looks like a telephone number is
 * refused rather than cleaned, because a repair could silently mangle a resident's own words —
 * which `FEAT-002` requires the platform to keep.
 *
 * The digest is over the assembled shape, never the values, so it is safe for telemetry.
 *
 * @module deidentification/deidentify
 */
import type { CapabilityName } from '../gateway/contract.ts';
import {
  CAPABILITY_ALLOW_LIST,
  CAPABILITY_SUBSTITUTIONS,
  DIRECT_IDENTIFIER_FIELDS,
} from './allow-list.ts';
import { payloadShapeDigest } from './digest.ts';

/**
 * A Nigerian mobile number, in the forms a resident actually types: `+234`, `234` or a leading `0`,
 * followed by the operator and subscriber digits, with optional spaces or hyphens. Lookarounds keep
 * it from matching a longer digit run.
 */
const TELEPHONE_PATTERN = /(?<![\d+])(?:\+?234[\s-]?|0)[789][01](?:[\s-]?\d){8}(?!\d)/;

/** A value the provider may receive. */
export type AllowedValue = string | number | boolean;

/** The payload after the boundary, ready to serialise. */
export type DeidentifiedPayload = Readonly<Record<string, AllowedValue>>;

/** What the boundary produced. */
export type DeidentificationResult =
  | {
      readonly ok: true;
      readonly payload: DeidentifiedPayload;
      /** Input fields withheld or substituted, sorted for reproducibility. */
      readonly removedFields: readonly string[];
      readonly shapeDigest: string;
    }
  | {
      readonly ok: false;
      /** `IDENTIFIER_PRESENT` for a telephone pattern, `UNSAFE_PAYLOAD_VALUE` for a value that is not scalar. */
      readonly cause: 'IDENTIFIER_PRESENT' | 'UNSAFE_PAYLOAD_VALUE';
      /** Payload paths that forced the refusal. Paths only; never the value. */
      readonly offendingFields: readonly string[];
      readonly removedFields: readonly string[];
      readonly shapeDigest: string;
    };

/**
 * Builds the outbound payload for one capability.
 *
 * @param capability - The registered capability whose allow-list applies.
 * @param input - The caller's payload object. Already checked to be a plain object.
 * @returns The assembled payload, or the reason it cannot be sent.
 */
export function deidentify(
  capability: CapabilityName,
  input: Readonly<Record<string, unknown>>,
): DeidentificationResult {
  const allowed = new Set(CAPABILITY_ALLOW_LIST[capability] ?? []);
  const substitutions = CAPABILITY_SUBSTITUTIONS[capability] ?? {};

  const payload: Record<string, AllowedValue> = {};
  const removed = new Set<string>();
  const unsafe: string[] = [];

  for (const [field, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (allowed.has(field) && !(field in substitutions)) {
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        payload[field] = value;
      } else {
        // A nested object or array could carry anything; the boundary will not vouch for it.
        unsafe.push(field);
      }
      continue;
    }
    // Not allowed, or overridden by a constant: withheld either way.
    removed.add(field);
  }

  for (const [field, value] of Object.entries(substitutions)) {
    payload[field] = value;
  }

  // A direct identifier named by the contract is reported even when it never reached the payload.
  for (const identifier of DIRECT_IDENTIFIER_FIELDS) {
    if (identifier in input) removed.add(identifier);
  }

  const offending = new Set<string>(unsafe);
  for (const [field, value] of Object.entries(payload)) {
    if (typeof value === 'string' && TELEPHONE_PATTERN.test(value)) offending.add(field);
  }

  const removedFields = [...removed].sort();
  const shapeDigest = payloadShapeDigest(payload);

  if (unsafe.length > 0) {
    return {
      ok: false,
      cause: 'UNSAFE_PAYLOAD_VALUE',
      offendingFields: [...new Set(unsafe)].sort(),
      removedFields,
      shapeDigest,
    };
  }
  if (offending.size > 0) {
    return {
      ok: false,
      cause: 'IDENTIFIER_PRESENT',
      offendingFields: [...offending].sort(),
      removedFields,
      shapeDigest,
    };
  }

  return { ok: true, payload, removedFields, shapeDigest };
}
