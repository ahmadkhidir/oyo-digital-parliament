/**
 * The shape digest telemetry and audit carry (`NFR-045`, `packages/inference/AGENTS.md`).
 *
 * The digest is over field names and value types — never values — so an operator can prove two
 * payloads had the same shape without a payload text reaching a log, a span, a metric label or an
 * error message.
 *
 * @module deidentification/digest
 */
import { createHash } from 'node:crypto';

/** How one value is described: its JSON type, and for an array the element types. */
function describe(value: unknown): unknown {
  if (Array.isArray(value)) return ['array', ...new Set(value.map(describe))];
  if (value === null) return 'null';
  return typeof value;
}

/**
 * Digests the shape of a payload.
 *
 * Keys are sorted so two payloads built in a different insertion order digest alike.
 *
 * @param payload - The de-identified payload, or any assembled record.
 * @returns `sha256:` and the lower-case hex digest, safe to log.
 */
export function payloadShapeDigest(payload: Readonly<Record<string, unknown>>): string {
  const shape = Object.keys(payload)
    .sort()
    .map((key) => [key, describe(payload[key])]);
  return `sha256:${createHash('sha256').update(JSON.stringify(shape)).digest('hex')}`;
}
