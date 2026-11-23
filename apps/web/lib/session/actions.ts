'use server';

/**
 * The sign-out action (`C-008`, `NFR-026`).
 *
 * One exported action for the one contract entry: it ends the session the request's cookie names
 * and clears the cookie with `Max-Age=0`. It takes no argument — `C-008`'s request shape is empty —
 * and can never name another session or device, because the only input it reads is the request's
 * own cookie.
 *
 * The action lives in the session module rather than beside one route's form, because `C-008`'s
 * surface is the action alone: the Record Header and My Record (both later tasks) render the
 * control that posts to it, and both import it from here so sign-out cannot diverge between them.
 */
import { redirect } from 'next/navigation';
import { readSession, signOut, type SignOutResult } from '@odp/domain';
import { actionRefusal, readActionRequest, type ActionFailureEnvelope } from '../http/rate-limit';
import { getSignInDependencies } from './deps';
import { clearMemberSessionCookie, presentedMemberSessionToken } from './session-cookies';

/**
 * Ends the caller's member session and returns them to the record home.
 *
 * A visitor with no cookie, or one whose cookie names no live session, is already signed out:
 * the contract answers `UNAUTHENTICATED` for that call, and the screen answer is the record home.
 * A degraded store leaves the cookie in place, so the member can try again rather than being
 * dropped with a token whose session may still be live (`NFR-026`).
 *
 * The action is a `C-001` surface: it reads `X-Correlation-Id` through the shared reader and
 * refuses a value outside the pattern with the contract's failure envelope, before it reads a
 * cookie or ends anything. The envelope carries `meta.rateLimit`; a browser form has no channel for
 * it and re-renders unchanged.
 */
export async function signOutAction(): Promise<void>;
export async function signOutAction(): Promise<ActionFailureEnvelope | void> {
  const request = await readActionRequest();
  if (!request.correlation.ok) {
    // `C-001`: the caller's identifier is outside the pattern, so nothing is ended.
    return actionRefusal(request.correlation, request.rateLimit) ?? undefined;
  }

  const token = await presentedMemberSessionToken();
  if (token === null) redirect('/');

  const ports = await getSignInDependencies();
  const correlationId = request.correlation.correlationId;

  // The session read names the account the audit record attributes the sign-out to (`C-008`).
  const resolved = await readSession(ports, { memberSessionToken: token });
  if (!resolved.ok) redirect('/'); // Degraded: nothing was ended, so nothing is cleared either.
  if (resolved.signedIn && resolved.member !== null) {
    const result: SignOutResult = await signOut(
      { kind: 'member', memberId: resolved.member.id, sessionId: token, correlationId },
      ports,
      {},
    );
    if (!result.ok) redirect('/'); // The session may still be live; the member retries sign-out.
  }

  await clearMemberSessionCookie();
  redirect('/');
}
