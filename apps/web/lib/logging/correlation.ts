/**
 * Correlation identifiers for operational logs (`C-001`, `C-091`).
 *
 * A log line is useful only when it can be tied back to the request that produced it, and `C-001`
 * fixes the form: `req_` followed by four to thirty-two upper-case alphanumerics. The value names a
 * request, never a person or a record, so it is safe to print.
 *
 * The Crockford base32 alphabet is used for generated values because it leaves out `I`, `L`, `O` and
 * `U`, the characters that get mistyped when an operator copies an identifier out of a log view.
 */
import { randomBytes } from 'node:crypto';

/** The pattern `C-001` gives for a caller-supplied `X-Correlation-Id`. */
export const CORRELATION_ID_PATTERN = /^req_[0-9A-Z]{4,32}$/;

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
 * Reads the correlation identifier a caller supplied, or mints one.
 *
 * An invalid header is replaced rather than refused: `C-091` says a probe must not fail on its input,
 * and the same rule keeps an operator's malformed instrumentation from breaking an ordinary request.
 *
 * @param headers - The incoming request headers.
 * @returns The supplied identifier when it is valid, otherwise a generated one.
 */
export function correlationIdFrom(headers: Headers): string {
  const supplied = headers.get('x-correlation-id');
  return supplied !== null && CORRELATION_ID_PATTERN.test(supplied) ? supplied : newCorrelationId();
}
