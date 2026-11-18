/**
 * Request fingerprinting for idempotent writes (ADR-002, `C-001`).
 *
 * The fingerprint identifies the payload of a request, so the same `Idempotency-Key` used with a
 * different payload is a conflict rather than a replay. It is a digest of a canonical form — object
 * keys sorted, `undefined` omitted — because two structurally equal payloads must produce one digest
 * regardless of property order.
 *
 * SHA-256 is used for length and collision resistance, not as a secret: a fingerprint is not an
 * authenticator and carries no personal data beyond what the caller already stored.
 */
import { createHash } from 'node:crypto';

/** Deterministic JSON for hashing. Arrays keep order; object keys are sorted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(',')}}`;
}

/** SHA-256 of the canonical payload, as lower-case hex. */
export function fingerprintRequest(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload), 'utf8').digest('hex');
}
