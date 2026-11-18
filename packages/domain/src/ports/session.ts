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
