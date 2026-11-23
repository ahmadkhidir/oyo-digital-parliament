/**
 * The `C-001` rate-limit signal, in one place (`C-001`, `NFR-027`).
 *
 * Every answer carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (epoch
 * seconds). A surface the limiter guards prints the answer its own consult produced: `consume`
 * returns the whole triple, and a `RATE_LIMITED` refusal carries the same triple, so the headers
 * never cost a second consult and can never disagree with the body.
 *
 * A surface that consults no limiter still carries a triple. `C-001` applies the headers to every
 * response while `NFR-027` caps only the writes it names, so a public read reports the read
 * allowance with nothing consumed: the cap it announces and the remaining value are the same, and
 * the reset is the end of the current window. The allowance is declared once here rather than at
 * each call site, which is what keeps the twenty-odd answers from drifting apart.
 *
 * A server action is the one surface with no response-header channel: Next.js serialises an
 * action's return value and re-rendered tree instead of letting the action write the response
 * headers, so the action's answer is its flow state. `signalOf` therefore answers the same triple
 * for that state, and the redirected render reads exactly the values a route handler would print.
 *
 * @module http/rate-limit
 */
import type { NextRequest } from 'next/server';
import {
  RATE_LIMIT_HEADER_NAMES,
  rateLimitHeaders,
  renderRateLimitHeaders,
  type RateLimitHeaders,
  type RateLimitOutcome,
} from '@odp/domain';

export { RATE_LIMIT_HEADER_NAMES };
export type { RateLimitHeaders };

/**
 * The allowance an unmetered surface reports.
 *
 * Reads are not metered (`NFR-027` caps registration, sign-in, submission, backing and comment
 * writes), so the triple states the deployment's read allowance and leaves it whole. The reverse
 * proxy is where a read ceiling is actually enforced; this is the value the application announces.
 */
const READ_ALLOWANCE = { limit: 120, windowSeconds: 60 } as const;

/** The read allowance, with the current window's reset as epoch seconds. */
export function readAllowance(now: Date = new Date()): RateLimitHeaders {
  const windowMs = READ_ALLOWANCE.windowSeconds * 1000;
  const windowIndex = Math.floor(now.getTime() / windowMs);
  return {
    limit: READ_ALLOWANCE.limit,
    remaining: READ_ALLOWANCE.limit,
    resetSeconds: Math.ceil(((windowIndex + 1) * windowMs) / 1000),
  };
}

/** Whether a domain answer carries the triple its own limiter produced. */
function carriesRateLimit(
  answer: RateLimitOutcome | { readonly rateLimit?: RateLimitHeaders },
): answer is { readonly rateLimit?: RateLimitHeaders } {
  return !('allowed' in answer);
}

/**
 * The triple one answer carries, or `null` when its surface consulted no limiter.
 *
 * A refusal from the limiter (or from a use case that kept its answer) supplies the triple
 * directly; a limiter outcome is reduced through the domain's own conversion, so the epoch
 * rounding has one author.
 *
 * @param answer - A limiter outcome, or a domain answer carrying `rateLimit`.
 */
export function signalOf(
  answer: RateLimitOutcome | { readonly rateLimit?: RateLimitHeaders },
): RateLimitHeaders | null {
  if (carriesRateLimit(answer)) return answer.rateLimit ?? null;
  return rateLimitHeaders(answer);
}

/**
 * Renders the triple as header name/value pairs.
 *
 * A `RATE_LIMITED` answer also carries `Retry-After`, which the domain's renderer adds from the
 * same answer.
 *
 * @param signal - The triple the answer produced.
 */
export function rateLimitHeaderValues(signal: RateLimitHeaders): Readonly<Record<string, string>> {
  return renderRateLimitHeaders(signal);
}

/**
 * Whether an answer already carries the whole `C-001` triple.
 *
 * @param headers - The response headers to read.
 */
export function hasRateLimitHeaders(headers: Headers): boolean {
  return (
    headers.has(RATE_LIMIT_HEADER_NAMES.limit) &&
    headers.has(RATE_LIMIT_HEADER_NAMES.remaining) &&
    headers.has(RATE_LIMIT_HEADER_NAMES.reset)
  );
}

/**
 * Copies one answer onto a fresh `Response` with the `C-001` triple added.
 *
 * The body, status, status text and every existing header are preserved: this is the same answer
 * the handler built, with three headers set. A surface with no limiter answer passes `null` and
 * gets the read allowance, unless the answer already printed a triple of its own.
 *
 * @param response - The answer the handler built.
 * @param signal - The triple it produced, if it produced one.
 * @param now - The instant the read allowance's window is computed from.
 */
export function withRateLimitHeaders(
  response: Response,
  signal: RateLimitHeaders | null = null,
  now: Date = new Date(),
): Response {
  if (signal === null && hasRateLimitHeaders(response.headers)) return response;
  const headers = new Headers(response.headers);
  const signalToPrint = signal ?? readAllowance(now);
  for (const [name, value] of Object.entries(rateLimitHeaderValues(signalToPrint))) {
    headers.set(name, value);
  }
  return new Response(response.body === null ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Wraps one route handler so every answer it builds carries the triple.
 *
 * The handler keeps parsing, authorising and answering as it did; this adds the three `C-001`
 * headers to whatever it returned. A metered surface still prints its own answer: it wraps its
 * response with {@link withRateLimitHeaders} and the refusal's triple, and this wrapper leaves an
 * answer that already carries a complete triple untouched.
 *
 * @param handler - The route handler, unchanged.
 */
export function rateLimited(
  handler: (request: NextRequest) => Promise<Response>,
): (request: NextRequest) => Promise<Response>;
export function rateLimited<Context>(
  handler: (request: NextRequest, context: Context) => Promise<Response>,
): (request: NextRequest, context: Context) => Promise<Response>;
export function rateLimited<Context>(
  handler: (request: NextRequest, context: Context) => Promise<Response>,
): (request: NextRequest, context: Context) => Promise<Response> {
  return async (request, context) => withRateLimitHeaders(await handler(request, context));
}
