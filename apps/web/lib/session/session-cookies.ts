/**
 * Applying and clearing the session cookies (`C-006` to `C-008`, `C-092`, `NFR-026`).
 *
 * The domain answers with the cookie the transport must set — its name, value and full header —
 * and only a server action or a route handler may touch cookies in Next.js, so this module is the
 * one place the transport turns that answer into a `Set-Cookie`. The attributes are the contract's
 * (`NFR-026`): HttpOnly, Secure, SameSite=Lax, one path, and a `Max-Age` that never outlives the
 * server-side session. The value is never invented here and never read from a form: a session token
 * arrives from the domain's answer, and a clearing cookie is written from the domain's clearing
 * answer.
 *
 * The two cookie names are the ones `C-007`, `C-008` and `C-092` print: `odp_session` for the member
 * namespace and `odp_staff_session` for the staff namespace. The domain builds them, but keeps its
 * constants off the package root, so the transport spells each name once, here, and the test beside
 * this module asserts both match the contract.
 */
import { cookies } from 'next/headers';

/** The member session cookie's name (`C-007`, `C-008`; `packages/domain` `SESSION_COOKIE_NAMES`). */
export const MEMBER_SESSION_COOKIE = 'odp_session';

/** The staff session cookie's name (`C-007`, `C-092`; `packages/domain` `SESSION_COOKIE_NAMES`). */
export const STAFF_SESSION_COOKIE = 'odp_staff_session';

/** The attributes every session cookie carries (`NFR-026`). */
const COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

/**
 * The session cookie's `Max-Age`, read from the header the domain built (`NFR-026`).
 *
 * @param header - The complete `Set-Cookie` header the use case answered with.
 * @param allowZero - Whether a clearing answer (`Max-Age=0`) is a lifetime this writer may apply.
 */
function maxAgeOf(header: string, allowZero = false): number | undefined {
  const match = /Max-Age=([0-9]+)/.exec(header);
  if (match === null) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isSafeInteger(seconds) || seconds < 0) return undefined;
  return seconds === 0 ? (allowZero ? 0 : undefined) : seconds;
}

/** The answer a use case returns: the cookie the transport must set, header attributes included. */
interface SessionCookieAnswer {
  readonly name: string;
  readonly value: string;
  readonly header: string;
}

/**
 * Sets the member session cookie a use case returned.
 *
 * A cookie whose window has already closed — the use case returned one with no positive
 * `Max-Age` — is never written: the browser would present a token the server has already dropped
 * (`NFR-026`).
 */
export async function setMemberSessionCookie(cookie: SessionCookieAnswer): Promise<void> {
  const maxAge = maxAgeOf(cookie.header);
  if (maxAge === undefined) return;
  const store = await cookies();
  store.set(cookie.name, cookie.value, { ...COOKIE_ATTRIBUTES, maxAge });
}

/**
 * Clears the member session cookie with `Max-Age=0` (`C-008`).
 *
 * Used by the sign-out action, and by an action that finds a presented token naming no live
 * session, so a dead token is dropped at the next write rather than presented forever.
 */
export async function clearMemberSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(MEMBER_SESSION_COOKIE, '', { ...COOKIE_ATTRIBUTES, maxAge: 0 });
}

/** Whether the request presents a member session token at all. */
export async function presentedMemberSessionToken(): Promise<string | null> {
  return presentedToken(MEMBER_SESSION_COOKIE);
}

/**
 * The two opaque session tokens the request presents, if any (`C-007`).
 *
 * The form a use case takes: an absent namespace is left out rather than spelled as `null`, so the
 * read treats it exactly as a request that carried no such cookie. The values are opaque; nothing
 * here parses, decodes or logs one.
 */
export interface PresentedSessionTokens {
  readonly memberSessionToken?: string;
  readonly staffSessionToken?: string;
}

/** Reads both session namespaces from the request's cookies. */
export async function presentedSessionTokens(): Promise<PresentedSessionTokens> {
  const member = await presentedToken(MEMBER_SESSION_COOKIE);
  const staff = await presentedToken(STAFF_SESSION_COOKIE);
  return {
    ...(member === null ? {} : { memberSessionToken: member }),
    ...(staff === null ? {} : { staffSessionToken: staff }),
  };
}

/**
 * Writes the session cookie an answer carries, clearing answer included (`C-007`, `NFR-026`).
 *
 * Used by the session-read route handler, where the use case has already decided the lifetime:
 * a live session renews the browser's window, and a token that names no live session arrives as
 * the domain's clearing answer with `Max-Age=0`, so the dead token stops being presented. Unlike
 * {@link setMemberSessionCookie}, which refuses a non-positive lifetime outright, this writer
 * applies the answer verbatim - a header with no `Max-Age` at all is the only thing it drops.
 */
export async function applySessionCookie(cookie: SessionCookieAnswer): Promise<void> {
  const maxAge = maxAgeOf(cookie.header, true);
  if (maxAge === undefined) return;
  const store = await cookies();
  store.set(cookie.name, cookie.value, { ...COOKIE_ATTRIBUTES, maxAge });
}

/** Reads one session namespace's token from the cookie store, or `null` when absent or empty. */
async function presentedToken(name: string): Promise<string | null> {
  const store = await cookies();
  const value = store.get(name)?.value;
  return value === undefined || value === '' ? null : value;
}
