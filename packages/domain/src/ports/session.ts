/**
 * The session transport contract and the rate-limit vocabulary (`NFR-026`, `NFR-027`, `C-005` to
 * `C-008`, `C-092`).
 *
 * Two things live here and nowhere else, because both sides of the wire need them and neither may
 * invent a spelling:
 *
 * - The cookie contract. A specialist who writes the sign-in action and the adapter that stores the
 *   session are in different areas, and a cookie written twice is a session that works in one path and
 *   not the other. One builder produces the header, one parser reads it back, and both namespaces
 *   (`odp_session`, `odp_staff_session`) are the ones `C-008` and `C-092` print.
 * - The limiter's subject vocabulary. A counter is keyed by the kind and the opaque value, never by a
 *   telephone number: the adapter turns the subject into a digest, and the key it writes carries the
 *   digest only (`packages/platform/AGENTS.md` Discipline).
 *
 * The interfaces are structural. The adapter in `packages/platform/src/adapters/session` satisfies
 * them without this file importing anything from it, which is what keeps the dependency direction
 * one-way.
 *
 * @module ports/session
 */

/** The two cookie namespaces. A staff cookie never authenticates a member surface, or the reverse. */
export const SESSION_COOKIE_NAMES = {
  member: 'odp_session',
  staff: 'odp_staff_session',
} as const;

/** Which session a cookie belongs to. */
export type SessionNamespace = keyof typeof SESSION_COOKIE_NAMES;

/**
 * The attributes every session cookie carries (`NFR-026`, `C-092`).
 *
 * `Secure` is not conditional on the environment. A local development server is reached over
 * `http://localhost`, which browsers treat as a secure context, so the attribute costs nothing there
 * and cannot be forgotten in staging.
 */
export interface SessionCookieAttributes {
  readonly httpOnly: true;
  readonly secure: true;
  readonly sameSite: 'Lax';
  readonly path: '/';
}

/** The one set of attributes a session cookie is written with. */
export const SESSION_COOKIE_ATTRIBUTES: SessionCookieAttributes = Object.freeze({
  httpOnly: true,
  secure: true,
  sameSite: 'Lax',
  path: '/',
});

/** A cookie ready for a `Set-Cookie` header. */
export interface SessionCookie {
  /** The cookie name, one of {@link SESSION_COOKIE_NAMES}. */
  readonly name: string;
  /** The cookie value. For a live session this is the opaque token; it is empty when cleared. */
  readonly value: string;
  /** The complete header value, attributes included. */
  readonly header: string;
}

/**
 * A session token: 32 random bytes in unpadded base64url form, or any opaque value of the same
 * character set that an adapter chooses.
 *
 * The value is checked before it enters a header, because a token containing `;` or whitespace would
 * otherwise be able to append cookie attributes of its own.
 */
const TOKEN_VALUE = /^[A-Za-z0-9_-]{16,512}$/;

/**
 * Build the `Set-Cookie` value for a live session.
 *
 * @param input.namespace - Which session namespace the cookie belongs to.
 * @param input.token - The opaque session token the adapter stored a digest of.
 * @param input.maxAgeSeconds - Whole seconds until the cookie is dropped. Required: a session cookie
 *   without an expiry outlives the server-side session and is a defect.
 * @throws TypeError when the token is not an opaque token or the lifetime is not a positive whole
 *   number. Both are programming defects rather than request errors.
 */
export function presentSessionCookie(input: {
  readonly namespace: SessionNamespace;
  readonly token: string;
  readonly maxAgeSeconds: number;
}): SessionCookie {
  if (!TOKEN_VALUE.test(input.token)) {
    throw new TypeError('a session token must be an opaque base64url value');
  }
  if (!Number.isSafeInteger(input.maxAgeSeconds) || input.maxAgeSeconds < 1) {
    throw new TypeError('a session cookie needs a positive whole-second lifetime');
  }
  const name = SESSION_COOKIE_NAMES[input.namespace];
  return {
    name,
    value: input.token,
    header: `${name}=${input.token}; ${attributes(input.maxAgeSeconds)}`,
  };
}

/**
 * Build the `Set-Cookie` value that clears a session cookie (`C-008`, `C-092`).
 *
 * @param namespace - Which cookie to clear.
 */
export function clearedSessionCookie(namespace: SessionNamespace): SessionCookie {
  const name = SESSION_COOKIE_NAMES[namespace];
  return { name, value: '', header: `${name}=; ${attributes(0)}` };
}

/**
 * Whether a value is one a session cookie may carry: unpadded base64url, long enough to be a secret.
 *
 * The check exists before anything enters a header, because a token containing `;` or whitespace could
 * otherwise append cookie attributes of its own.
 */
export function isSessionToken(value: string): boolean {
  return TOKEN_VALUE.test(value);
}

/**
 * Build the cookie for a session that is still live, or report that there is none to present.
 *
 * A use case hands the transport a cookie rather than deciding when one may be set: a `Set-Cookie` with
 * a lifetime the server-side session does not have leaves a browser presenting a token that no longer
 * resolves for one request longer than the record allows (`NFR-026`).
 *
 * The lifetime is the earlier of the two windows, because a renewed idle window never extends past the
 * absolute one. A session whose window has already closed — the clock stepped past it between the
 * adapter's read and this call — produces nothing rather than a negative `Max-Age`. So does a handle
 * that is not an opaque token: a value no browser may carry cannot be written into a header, and a read
 * path must still answer the request it was given.
 *
 * @param input.namespace - Which session namespace the cookie belongs to.
 * @param input.token - The opaque token the adapter issued.
 * @param input.expiresAt - The idle expiry the adapter reported.
 * @param input.absoluteExpiresAt - The absolute expiry, when the session has one.
 * @param input.now - The instant the use case computed, from the injected clock.
 * @throws TypeError when either instant is not an instant. That is a programming defect rather than a
 *   request error.
 */
export function liveSessionCookie(input: {
  readonly namespace: SessionNamespace;
  readonly token: string;
  readonly expiresAt: string;
  readonly absoluteExpiresAt?: string;
  readonly now: string;
}): SessionCookie | null {
  const idleEnds = Date.parse(input.expiresAt);
  const absoluteEnds =
    input.absoluteExpiresAt === undefined ? idleEnds : Date.parse(input.absoluteExpiresAt);
  const nowMs = Date.parse(input.now);
  if (!Number.isFinite(idleEnds) || !Number.isFinite(absoluteEnds) || !Number.isFinite(nowMs)) {
    throw new TypeError('a session window must be an instant');
  }
  if (!isSessionToken(input.token)) return null;
  const maxAgeSeconds = Math.ceil((Math.min(idleEnds, absoluteEnds) - nowMs) / 1000);
  if (maxAgeSeconds < 1) return null;
  return presentSessionCookie({
    namespace: input.namespace,
    token: input.token,
    maxAgeSeconds,
  });
}

/**
 * Read one session token from a request's `Cookie` header.
 *
 * @param cookieHeader - The raw header value, or `null`/`undefined` when the request carried none.
 * @param namespace - Which cookie to look for.
 * @returns The token, or `null` when the cookie is absent or empty. The value is not decoded: a
 *   token is opaque and an encoded one would not be the token the adapter issued.
 */
export function readSessionCookie(
  cookieHeader: string | null | undefined,
  namespace: SessionNamespace,
): string | null {
  if (cookieHeader === null || cookieHeader === undefined) return null;
  const name = SESSION_COOKIE_NAMES[namespace];
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${name}=`)) continue;
    const value = trimmed.slice(name.length + 1);
    return value === '' ? null : value;
  }
  return null;
}

/** Render the shared attributes, with the lifetime last so a reader sees how long it lives. */
function attributes(maxAgeSeconds: number): string {
  const { path, httpOnly, secure, sameSite } = SESSION_COOKIE_ATTRIBUTES;
  return [
    `Path=${path}`,
    httpOnly ? 'HttpOnly' : '',
    secure ? 'Secure' : '',
    `SameSite=${sameSite}`,
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter((attribute) => attribute !== '')
    .join('; ');
}

/** The kinds of subject a rate-limit counter may be keyed by (`NFR-027`). */
export type RateLimitSubjectKind = 'number' | 'address' | 'member' | 'staff' | 'ward';

/**
 * What a cap is counted against.
 *
 * `value` is the thing itself — a telephone number, an address, an identifier — and it is personal
 * data for the first two. The adapter digests it and writes the digest only, so no key carries it.
 */
export interface RateLimitSubject {
  readonly kind: RateLimitSubjectKind;
  readonly value: string;
}

/** One limiter consult, as a use case names it. */
export interface RateLimitRequest {
  /** The bucket the use case names, such as `sign_in` or `registration`. */
  readonly bucket: string;
  readonly subject: RateLimitSubject;
  /** A cap the specification fixes, which the adapter must not lower or raise by configuration. */
  readonly fixedLimit?: number;
}

/** The limiter's answer. */
export interface RateLimitOutcome {
  readonly allowed: boolean;
  /** Seconds until the window resets. `0` when the call was allowed. */
  readonly retryAfterSeconds: number;
  /** The cap that applied, for the `RateLimit-Limit` header `C-001` requires. */
  readonly limit: number;
  /** Calls left in this window, for `RateLimit-Remaining`. Never below zero. */
  readonly remaining: number;
  /** When the fixed window resets, as a `C-001` instant, for `RateLimit-Reset`. */
  readonly resetAt: string;
}

/** The header names `C-001` fixes, so no caller spells them itself. */
export const RATE_LIMIT_HEADER_NAMES = {
  limit: 'RateLimit-Limit',
  remaining: 'RateLimit-Remaining',
  reset: 'RateLimit-Reset',
  retryAfter: 'Retry-After',
} as const;

/**
 * The rate-limit signals every `C-001` response carries.
 *
 * `C-001` prints `RateLimit-Reset` as epoch seconds while the limiter reports an instant, so the
 * conversion happens once, here, rather than at every call site.
 */
export interface RateLimitHeaders {
  readonly limit: number;
  readonly remaining: number;
  /** `RateLimit-Reset`, in epoch seconds as `C-001` specifies. */
  readonly resetSeconds: number;
  /** `Retry-After`, on a refusal only. */
  readonly retryAfterSeconds?: number;
}

/**
 * Read the `C-001` headers out of a limiter answer.
 *
 * The limiter port promises the whole {@link RateLimitOutcome}, so in practice a refusal carries its
 * own values and the transport prints them without a second consult. The read stays defensive anyway:
 * an answer that predates the widened port, or a double that reports only its decision, yields `null`,
 * and the transport then emits no headers rather than a malformed one.
 *
 * @param outcome - The limiter's answer, as the use case received it.
 */
export function rateLimitHeaders(outcome: {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}): RateLimitHeaders | null {
  if (!('limit' in outcome) || !('remaining' in outcome) || !('resetAt' in outcome)) return null;
  const { limit, remaining, resetAt } = outcome;
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0) return null;
  if (typeof remaining !== 'number' || !Number.isSafeInteger(remaining) || remaining < 0) {
    return null;
  }
  if (typeof resetAt !== 'string') return null;
  const resetMs = Date.parse(resetAt);
  if (!Number.isFinite(resetMs)) return null;
  const retryAfterSeconds = outcome.retryAfterSeconds;
  return {
    limit,
    remaining,
    resetSeconds: Math.ceil(resetMs / 1000),
    ...(retryAfterSeconds > 0 ? { retryAfterSeconds } : {}),
  };
}

/**
 * Render {@link RateLimitHeaders} as the header name/value pairs a response carries.
 *
 * @param headers - The triple read from one limiter answer.
 */
export function renderRateLimitHeaders(
  headers: RateLimitHeaders,
): Readonly<Record<string, string>> {
  return {
    [RATE_LIMIT_HEADER_NAMES.limit]: String(headers.limit),
    [RATE_LIMIT_HEADER_NAMES.remaining]: String(headers.remaining),
    [RATE_LIMIT_HEADER_NAMES.reset]: String(headers.resetSeconds),
    ...(headers.retryAfterSeconds === undefined
      ? {}
      : { [RATE_LIMIT_HEADER_NAMES.retryAfter]: String(headers.retryAfterSeconds) }),
  };
}
