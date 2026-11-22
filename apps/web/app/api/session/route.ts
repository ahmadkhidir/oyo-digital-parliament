/**
 * `GET /api/session` - the session read (`C-007`, `NFR-026`).
 *
 * Public by contract: the answer reports the caller's state, and a signed-out visitor is a
 * successful `200` rather than a refusal. The handler parses nothing, decides no rule and renders
 * nothing. It reads the two cookie namespaces (`odp_session`, `odp_staff_session`) and the visitor's
 * locale, calls the domain's `readSession`, and returns the envelope `C-007` prints.
 *
 * Two transport facts live here rather than in the domain:
 *
 * - **The cookie answer is applied.** A live session renews the browser's lifetime and a token that
 *   names no live session arrives as the domain's clearing answer (`NFR-026`), so the browser stops
 *   presenting a dead token.
 * - **The answer is never cached.** It is specific to one caller's cookies, so the route is
 *   dynamic and says `no-store`; a shared cache holding one member's session body would serve it to
 *   the next visitor.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { readSession, toIsoSeconds } from '@odp/domain';
import { resolveLocale } from '../../../lib/i18n/locale';
import { correlationIdFrom } from '../../../lib/logging';
import { getSignInDependencies } from '../../../lib/session/deps';
import { sessionReadAnswer } from '../../../lib/session/read-answer';
import { applySessionCookie, presentedSessionTokens } from '../../../lib/session/session-cookies';

// A cached session read is another caller's session read.
export const dynamic = 'force-dynamic';

/** Answers the caller's session state in the `C-007` body. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const ports = await getSignInDependencies();
  const tokens = await presentedSessionTokens();

  const result = await readSession(ports, {
    ...tokens,
    // The member's own locale is authoritative once signed in (`C-001` Locale); this is the
    // anonymous visitor's choice, which the domain reads only when it has no member answer.
    locale: await resolveLocale(),
  });

  const answer = sessionReadAnswer(result, {
    correlationId: correlationIdFrom(request.headers),
    // `C-001` `meta.asAt` is the instant the answer was computed, from the same clock the use case
    // read, not the moment the transport formatted it.
    asAt: toIsoSeconds(ports.clock.now()),
  });

  if (answer.status === 200 && answer.cookie !== undefined) {
    await applySessionCookie(answer.cookie);
  }

  return NextResponse.json(answer.body, {
    status: answer.status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
