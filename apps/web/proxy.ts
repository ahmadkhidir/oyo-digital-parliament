/**
 * The deployable's network-boundary gate (`NFR-026`).
 *
 * Next.js 16 replaced the `middleware` file convention with `proxy.ts` and warns at build time when
 * the old name is present. The gate therefore lives here, and the exported function is `proxy`.
 * What it does is unchanged: it is the fast redirect for a visitor with no member session reaching
 * a member-only path, and it is not the authorisation.
 *
 * Every page and action behind these routes resolves the session itself (`readSession`, `C-007`)
 * and never trusts this gate, because a matcher change or a refactor can silently drop its
 * coverage.
 *
 * The cookie it checks is the member session's own name (`C-007`, `C-008`; the domain keeps the
 * constant off its root, so the transport spells it here and the test beside `lib/session` asserts
 * the spelling).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { MEMBER_GATE_COOKIE, memberGateDecision } from './lib/session/gate';

/** Runs the gate for one request. */
export function proxy(request: NextRequest): NextResponse {
  const decision = memberGateDecision(
    request.nextUrl.pathname,
    request.cookies.get(MEMBER_GATE_COOKIE) !== undefined,
  );
  if (decision.action === 'next') return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = decision.to;
  url.search = '';
  url.searchParams.set('returnTo', decision.returnTo);
  return NextResponse.redirect(url);
}

/** Only the member-only paths; every other request is untouched. */
export const config = {
  matcher: ['/me', '/me/:path*', '/submit', '/submit/:path*'],
};
