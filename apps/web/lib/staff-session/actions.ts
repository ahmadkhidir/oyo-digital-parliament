'use server';

/**
 * Ending the current staff session (`C-092`, `NFR-026`, screen 26 Sign out).
 *
 * One exported action. It ends the session the cookie names, clears the cookie with `Max-Age=0` and
 * returns to the staff sign-in. A signed-out caller is already where the action would send them; a
 * degraded session store leaves the cookie alone so a live session is not dropped with a token whose
 * record may still stand.
 */
import { redirect } from 'next/navigation';
import { signOutStaff } from '@odp/domain';
import { actionRefusal, readActionRequest, type ActionFailureEnvelope } from '../http/rate-limit';
import { resolveLocale } from '../i18n/locale';
import { getStaffAdminDependencies } from './deps';
import { readStaffAccess, staffCaller } from './session';
import {
  clearEnrolmentCookie,
  clearRecoveryCookie,
  clearStaffFlow,
  clearStaffSessionCookie,
} from './cookies';
import { newIdempotencyKey } from './request';

/**
 * Ends the caller's staff session and returns to `/staff/sign-in`.
 *
 * A `C-001` surface: a malformed `X-Correlation-Id` is refused with the contract's failure envelope
 * before the session is read, so a refusal ends nothing and clears no cookie.
 */
export async function signOutStaffAction(): Promise<void>;
export async function signOutStaffAction(): Promise<ActionFailureEnvelope | void> {
  const request = await readActionRequest();
  if (!request.correlation.ok) {
    return actionRefusal(request.correlation, request.rateLimit) ?? undefined;
  }

  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in');
  if (access.kind === 'degraded') redirect('/admin');

  const dependencies = await getStaffAdminDependencies();
  const result = await signOutStaff(
    staffCaller(access, await resolveLocale(), request.correlation.correlationId),
    dependencies.identity,
    { scope: 'current', idempotencyKey: newIdempotencyKey() },
  );
  if (!result.ok && result.cause === 'SESSION_STORE_UNAVAILABLE') redirect('/admin');

  await clearStaffSessionCookie();
  await clearStaffFlow();
  await clearEnrolmentCookie();
  await clearRecoveryCookie();
  redirect('/staff/sign-in');
}
