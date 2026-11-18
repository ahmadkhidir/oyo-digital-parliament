/**
 * Applying and clearing the member session cookie (`C-006`, `C-008`, `NFR-026`).
 *
 * The domain answers with the cookie the transport must set — its name, value and full header —
 * and only a server action may touch cookies in Next.js, so this module is the one place an
 * action turns that answer into a `Set-Cookie`. The attributes are the contract's (`NFR-026`):
 * HttpOnly, Secure, SameSite=Lax, one path, and a `Max-Age` that never outlives the server-side
 * session. The value is never invented here and never read from a form: a session token arrives
 * from the domain's answer, and a clearing cookie is written from the domain's clearing answer.
 *
 * The cookie name is the one `C-007` and `C-008` print (`odp_session`, the member namespace).
 * The domain builds it, but keeps its constants off the package root, so the transport spells the
 * name once, here, and the test beside this module asserts it matches the contract.
 */
import { cookies } from 'next/headers';

/** The member session cookie's name (`C-007`, `C-008`; `packages/domain` `SESSION_COOKIE_NAMES`). */
export const MEMBER_SESSION_COOKIE = 'odp_session';

/** The attributes every session cookie carries (`NFR-026`). */
const COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

/** The session cookie's `Max-Age`, read from the header the domain built (`NFR-026`). */
function maxAgeOf(header: string): number | undefined {
  const match = /Max-Age=([0-9]+)/.exec(header);
  if (match === null) return undefined;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
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
  const store = await cookies();
  const value = store.get(MEMBER_SESSION_COOKIE)?.value;
  return value === undefined || value === '' ? null : value;
}
