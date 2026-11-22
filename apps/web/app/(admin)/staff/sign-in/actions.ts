'use server';

/**
 * The password step (`C-092`, `screens/24-staff-sign-in.md`).
 *
 * One exported action for the one contract entry. Every exit is a redirect, so the no-scripting path
 * answers exactly as the enhanced one. The username survives a refusal; the password never does and
 * is never written to a cookie, a log line or a URL.
 */
import { redirect } from 'next/navigation';
import {
  beginStaffSignIn,
  readPassword,
  readSession,
  readUsername,
  type BeginStaffSignInResult,
} from '@odp/domain';
import { newCorrelationId } from '../../../../lib/logging';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import { presentedMemberSessionToken } from '../../../../lib/session/session-cookies';
import {
  clearStaffFlow,
  setStaffSessionCookie,
  writeStaffFlow,
  type StaffFlowCause,
} from '../../../../lib/staff-session/cookies';
import { newIdempotencyKey, requestAddress } from '../../../../lib/staff-session/request';

/** Reads one string field from the form. */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Maps a `C-092` refusal onto the state the sign-in screen renders. */
function refusalState(failure: Extract<BeginStaffSignInResult, { ok: false }>): {
  readonly cause: StaffFlowCause;
  readonly retryAfterSeconds?: number;
  readonly lockedUntil?: string;
} {
  switch (failure.cause) {
    case 'STAFF_CREDENTIALS_INVALID':
      return { cause: 'STAFF_CREDENTIALS_INVALID' };
    case 'ACCOUNT_LOCKED': {
      const seconds = failure.retryAfterSeconds ?? 0;
      return {
        cause: 'ACCOUNT_LOCKED',
        retryAfterSeconds: seconds,
        lockedUntil: new Date(Date.now() + seconds * 1000).toISOString(),
      };
    }
    case 'STAFF_INACTIVE':
      return { cause: 'STAFF_INACTIVE' };
    case 'MEMBER_SESSION_PRESENT':
      return { cause: 'MEMBER_SESSION_PRESENT' };
    case 'STAFF_SIGN_IN_RATE_LIMITED':
      return {
        cause: 'STAFF_SIGN_IN_RATE_LIMITED',
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      };
    case 'STAFF_SIGN_IN_INVALID':
      return { cause: 'VALIDATION' };
    default:
      return { cause: 'DEGRADED' };
  }
}

/**
 * Opens one staff challenge from the submitted username and password.
 *
 * The answer is not a sign-in: the session is unsatisfied until `C-092`'s second factor is proven, so
 * the redirect lands on `/staff/2fa` and no admin destination is reachable before that.
 */
export async function beginStaffSignInAction(formData: FormData): Promise<void> {
  const username = readField(formData, 'username');
  const password = readField(formData, 'password');

  const dependencies = await getStaffAdminDependencies();
  const locale = await resolveLocale();
  const correlationId = newCorrelationId();

  // `C-092`: a live member session may not open a staff session. A stale member cookie is not a
  // session and is left alone; the staff door then answers on its own terms.
  const memberToken = await presentedMemberSessionToken();
  let caller: Parameters<typeof beginStaffSignIn>[0] = { kind: 'public', locale, correlationId };
  if (memberToken !== null) {
    const memberRead = await readSession(dependencies.identity, {
      memberSessionToken: memberToken,
    });
    if (memberRead.ok && memberRead.signedIn && memberRead.member !== null) {
      caller = {
        kind: 'member',
        memberId: memberRead.member.id,
        sessionId: memberToken,
        correlationId,
      };
    }
  }

  // The field readers run before the use case so an empty form answers the Validation state without
  // spending a limiter consult.
  const usernameReading = readUsername(username);
  const passwordReading = readPassword(password);
  if (!usernameReading.ok || !passwordReading.ok) {
    await writeStaffFlow({ cause: 'VALIDATION', username });
    redirect('/staff/sign-in');
  }

  const result = await beginStaffSignIn(caller, dependencies.identity, {
      username: usernameReading.value,
      password: passwordReading.value,
      idempotencyKey: newIdempotencyKey(),
      sourceAddress: await requestAddress(),
    },
  );

  if (!result.ok) {
    if (result.cause === 'STAFF_SESSION_PRESENT') redirect('/admin');
    await writeStaffFlow({ ...refusalState(result), username });
    redirect('/staff/sign-in');
  }

  if (result.cookie !== undefined) await setStaffSessionCookie(result.cookie);
  await clearStaffFlow();
  // Enrolled or not, the next screen is the factor screen: verification when a factor exists, and
  // enrolment when it does not.
  redirect('/staff/2fa');
}
