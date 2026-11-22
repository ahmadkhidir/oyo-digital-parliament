/**
 * Correlation identifiers for operational logs (`C-001`, `C-091`).
 *
 * A log line is useful only when it can be tied back to the request that produced it, and `C-001`
 * fixes the form: `req_` followed by four to thirty-two upper-case alphanumerics. The value names a
 * request, never a person or a record, so it is safe to print.
 *
 * Two readings of the same header live here because the contract gives them different answers:
 *
 * - `readCorrelationId` is the `C-001` reading an ordinary `/api` surface uses. A supplied value
 *   outside the pattern is a refusal, not something to replace.
 * - `correlationIdFrom` is the tolerant reading the operational path uses. `C-091` says a probe must
 *   not fail on its input, so a malformed header there is replaced and the request continues.
 *
 * The Crockford base32 alphabet is used for generated values because it leaves out `I`, `L`, `O` and
 * `U`, the characters that get mistyped when an operator copies an identifier out of a log view.
 */
import { randomBytes } from 'node:crypto';

/** The pattern `C-001` gives for a caller-supplied `X-Correlation-Id`. */
export const CORRELATION_ID_PATTERN = /^req_[0-9A-Z]{4,32}$/;

/**
 * What a caller-supplied `X-Correlation-Id` resolves to.
 *
 * `ok` is `false` only for a supplied value outside the contract's pattern. The identifier is
 * present on both branches: a refusal still needs one to label its own log line, and the refused
 * value is never reused for that.
 */
export type CorrelationReading =
  | { readonly ok: true; readonly correlationId: string }
  | { readonly ok: false; readonly correlationId: string };

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Generates a correlation identifier that satisfies `C-001`.
 *
 * @returns A fresh `req_` identifier with a twenty-six character body.
 */
export function newCorrelationId(): string {
  const bytes = randomBytes(26);
  let body = '';
  for (const byte of bytes) {
    // The alphabet has thirty-two members, so a byte maps onto it without bias beyond 1/32.
    body += CROCKFORD[byte & 31] ?? '0';
  }
  return `req_${body}`;
}

/**
 * Reads the correlation identifier for an ordinary `C-001` surface.
 *
 * A malformed value is refused rather than echoed, so the caller answers `VALIDATION_FAILED` with
 * `fields: { "X-Correlation-Id": "PATTERN_MISMATCH" }`. The identifier returned beside `ok: false`
 * is freshly minted: it labels the refusal in the log, and the refused value is not printed or
 * reused anywhere. An absent header is minted, because `C-001` makes the header optional.
 *
 * @param headers - The incoming request headers.
 * @returns Whether the supplied value is admissible, and the identifier in use either way.
 */
export function readCorrelationId(headers: Headers): CorrelationReading {
  const supplied = headers.get('x-correlation-id');
  if (supplied === null) return { ok: true, correlationId: newCorrelationId() };
  if (CORRELATION_ID_PATTERN.test(supplied)) return { ok: true, correlationId: supplied };
  return { ok: false, correlationId: newCorrelationId() };
}

/**
 * Reads the correlation identifier without ever refusing (`C-091`).
 *
 * This is the reading the probes and the operational logging path use: a probe that failed on its
 * input would let a stray header take a process out of rotation, so a malformed value is replaced
 * with a generated one and the request proceeds. An ordinary `/api` surface uses
 * `readCorrelationId` instead, because `C-001` refuses the malformed value there.
 *
 * @param headers - The incoming request headers.
 * @returns The supplied identifier when it is valid, otherwise a generated one.
 */
export function correlationIdFrom(headers: Headers): string {
  return readCorrelationId(headers).correlationId;
}
