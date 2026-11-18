'use server';

/**
 * The confirmation actions (`C-003` and `C-004`, `screens/04-number-confirmation.md`).
 *
 * Two exported actions for the two contract entries the screen's forms post to: `confirmRegistration`
 * proves the code and creates the account, `resendRegistrationCode` issues a fresh code against the
 * same pending record. The pending registration's identifier comes from the flow's cookie, never
 * from the request body: a visitor can only ever confirm the record this browser created.
 *
 * As on `/join`, every exit is a redirect. A refusal writes one cause token — with the attempt and
 * cooldown counts the contracts carry — into the status cookie, and the redirected render turns it
 * into the state the screen file declares. A confirmation writes the session cookie the use case
 * handed back (`C-003`/`NFR-026`), clears the flow, and follows the contract's `nextScreen`.
 */
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  confirmRegistration,
  readCode,
  resendRegistrationCode,
  type ConfirmRegistrationResult,
  type IdentityFailure,
  type ResendRegistrationCodeResult,
} from '@odp/domain';
import { newCorrelationId } from '../../../../lib/logging';
import { getIdentityDependencies } from '../../../../lib/identity/ports';
import {
  clearConfirmStatus,
  clearJoinPending,
  clearJoinRetry,
  emptyJoinFormValues,
  readJoinPending,
  writeConfirmStatus,
  writeJoinRetry,
  type ConfirmStatusState,
} from '../../../../lib/identity/join-cookies';

/** The session cookie's `Max-Age`, read from the header the domain built (`NFR-026`). */
function maxAgeOf(header: string): number | undefined {
  const match = /Max-Age=([0-9]+)/.exec(header);
  if (match === null) return undefined;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

/** Sets the member session cookie the use case returned, with the attributes the contract fixes. */
async function setSessionCookie(cookie: {
  readonly name: string;
  readonly value: string;
  readonly header: string;
}): Promise<void> {
  const store = await cookies();
  const maxAge = maxAgeOf(cookie.header);
  if (maxAge === undefined) return; // The window already closed; no cookie is written (`NFR-026`).
  store.set(cookie.name, cookie.value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

/** Ends a flow whose pending registration is gone: clears the pointers and leaves the notice. */
async function expireRegistration(): Promise<void> {
  await clearConfirmStatus();
  await clearJoinPending();
  await clearJoinRetry();
  await writeJoinRetry({
    values: emptyJoinFormValues(),
    fields: {},
    status: 'REGISTRATION_EXPIRED',
  });
}

/** One refused attempt, held for the redirected render. */
async function holdStatus(status: Omit<ConfirmStatusState, 'at'>): Promise<void> {
  await writeConfirmStatus(status);
}

/**
 * Maps a `C-003` refusal onto the status grain the screen renders.
 *
 * The screen's states name the causes: incorrect (with attempts remaining), expired, the cooldown
 * after the tries are used up, and a code that already made an account. Anything the contract
 * answers `SERVICE_DEGRADED` for is one degraded sentence; a pending registration the use case has
 * reported gone ends the flow with the notice on `/join`.
 */
function confirmRefusal(failure: IdentityFailure): Omit<ConfirmStatusState, 'at'> | 'gone' {
  switch (failure.cause) {
    case 'CODE_INCORRECT':
      return {
        cause: 'CODE_INCORRECT',
        ...(failure.attemptsRemaining === undefined
          ? {}
          : { attemptsRemaining: failure.attemptsRemaining }),
      };
    case 'CODE_EXPIRED':
      return { cause: 'CODE_EXPIRED' };
    case 'CODE_ATTEMPTS_EXCEEDED':
      return {
        cause: 'CODE_ATTEMPTS_EXCEEDED',
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      };
    case 'CODE_ALREADY_USED':
      return { cause: 'CODE_ALREADY_USED' };
    case 'PENDING_REGISTRATION_EXPIRED':
      return 'gone';
    default:
      return { cause: 'DEGRADED' };
  }
}

/**
 * Proves the code and creates the account (`C-003`).
 *
 * The six digits are re-checked at the boundary before the use case runs, so a malformed post is
 * refused without a store round-trip, and the failure names the code field.
 */
export async function confirmRegistrationAction(formData: FormData): Promise<void> {
  const pending = await readJoinPending();
  if (pending === null) redirect('/join'); // No record this browser created: start at the form.

  const { ports } = await getIdentityDependencies();
  const correlationId = newCorrelationId();
  const code = String(formData.get('code') ?? '');

  const reading = readCode(code);
  if (!reading.ok) {
    // The field's own reasons (`C-003` `fields:{"code":["REQUIRED","PATTERN_MISMATCH"]}`); the
    // render maps them onto the code control and clears nothing — the field is empty because the
    // visitor's digits were refused, exactly as the screen file states.
    await holdStatus({ cause: reading.reason });
    redirect('/join/confirm');
  }

  const result: ConfirmRegistrationResult = await confirmRegistration(
    { kind: 'public', correlationId },
    ports,
    { pendingRegistrationId: pending.id, code: reading.value },
  );

  if (!result.ok) {
    const refusal = confirmRefusal(result);
    if (refusal === 'gone') {
      await expireRegistration();
      redirect('/join');
    }
    await holdStatus(refusal);
    redirect('/join/confirm');
  }

  // The account exists and the session is open: the cookie is the session's own answer
  // (`C-003`, `NFR-026`), the flow is finished, and the ward screen is next by contract.
  if (result.cookie !== undefined) {
    await setSessionCookie(result.cookie);
  }
  await clearConfirmStatus();
  await clearJoinPending();
  redirect(result.nextScreen);
}

/**
 * Maps a `C-004` refusal onto the status grain the screen renders.
 *
 * The screen's states name them: the resend cooldown (with the time remaining), the per-number cap,
 * a dispatch the channel refused (with the pending registration preserved, as `C-004` states), and
 * a registration that has run out of its 24 hours.
 */
function resendRefusal(failure: IdentityFailure): Omit<ConfirmStatusState, 'at'> | 'gone' {
  switch (failure.cause) {
    case 'SMS_CHANNEL_UNAVAILABLE':
      return { cause: 'RESEND_FAILED' };
    case 'RESEND_COOLDOWN':
      return {
        cause: 'RESEND_COOLDOWN',
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      };
    case 'REGISTRATION_RATE_LIMITED':
      return {
        cause: 'RESEND_CAP',
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      };
    case 'PENDING_REGISTRATION_EXPIRED':
    case 'CODE_ALREADY_USED':
      return 'gone';
    default:
      return { cause: 'DEGRADED' };
  }
}

/**
 * Issues one fresh code against the same pending registration (`C-004`).
 *
 * The action takes no argument: the pending record this browser holds is the only one it may
 * resend for, and the use case owns the one-minute timer and the per-number cap.
 */
export async function resendRegistrationCodeAction(): Promise<void> {
  const pending = await readJoinPending();
  if (pending === null) redirect('/join');

  const { ports } = await getIdentityDependencies();
  const correlationId = newCorrelationId();

  const result: ResendRegistrationCodeResult = await resendRegistrationCode(
    { kind: 'public', correlationId },
    ports,
    { pendingRegistrationId: pending.id },
  );

  if (!result.ok) {
    const refusal = resendRefusal(result);
    if (refusal === 'gone') {
      await expireRegistration();
      redirect('/join');
    }
    await holdStatus(refusal);
    redirect('/join/confirm');
  }

  // A fresh code is on its way; the cooldown restarts from the record's new `codeSentAt`, which
  // the next render reads, and the status names the send so the wait is explained.
  await holdStatus({ cause: 'RESENT' });
  redirect('/join/confirm');
}
