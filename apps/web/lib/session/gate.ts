/**
 * The member-session gate's decision logic (`NFR-026`, `screens.md` Record Header sign-in prompt).
 *
 * Two member surfaces — `/me` (My Record) and `/submit` (the submission form) — are reachable only
 * with a member session. The Next.js proxy file is the fast redirect: it sends a visitor with no
 * session cookie to `/sign-in` and carries the place they came from, so the member returns to the
 * same screen after signing in (`user-flow.md` Authentication Gate).
 *
 * Two deliberate limits, both stated in `apps/web/AGENTS.md` Discipline:
 *
 * - **The gate is advisory.** The proxy runs before the render and cannot reach the session store,
 *   so a presented cookie is treated as a session. The pages and actions behind these routes
 *   resolve the session themselves (`readSession`, `C-007`) and never trust the gate.
 * - **The token is never read here beyond its presence.** A cookie value is opaque; the proxy
 *   does not parse, decode or log it. The cookie name it checks is the member namespace `C-007`
 *   and `C-008` print; the domain keeps the constant off its root, so the transport spells it in
 *   the proxy file, and the test beside this module pins the spelling.
 */

/** The member-only paths this deployable declares so far, guarded at the network boundary. */
export const MEMBER_ONLY_PATHS = ['/me', '/submit'] as const;

/** The member session cookie's name, spelled here so the gate and the actions cannot drift apart. */
export const MEMBER_GATE_COOKIE = 'odp_session';

/** Whether a request path sits inside one of the member-only paths. */
function isMemberOnlyPath(pathname: string): boolean {
  return MEMBER_ONLY_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** What the gate tells the proxy to do with one request. */
export type GateDecision =
  | { readonly action: 'next' }
  | { readonly action: 'redirect'; readonly to: string; readonly returnTo: string };

/**
 * Decides one request.
 *
 * @param pathname - The request path, without the query.
 * @param memberCookieName - The cookie name the gate checks for presence.
 * @param hasCookie - Whether the request carries the named member session cookie.
 */
export function memberGateDecision(pathname: string, hasCookie: boolean): GateDecision {
  if (!isMemberOnlyPath(pathname)) return { action: 'next' };
  if (hasCookie) return { action: 'next' };
  return {
    action: 'redirect',
    to: '/sign-in',
    // The return path stays an internal path: the sign-in action re-validates it (`readReturnTo`).
    returnTo: pathname,
  };
}
