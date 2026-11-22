'use server';

/**
 * The sign-in actions (`C-005`, `C-006`, `screens/02-sign-in.md`).
 *
 * Three exported actions: the number step and the resend both post to the `C-005` contract entry
 * (`requestSignInCode`), each through its own action so no form posts to a catch-all; the code
 * step posts to the `C-006` entry (`completeSignIn`); and the "use a different number" control
 * posts to a navigation reset that touches no contract.
 *
 * The pending challenge's identifier comes from the flow's cookie, never from the request body: a
 * browser can only ever complete the sign-in it started. A number belongs to at most one account
 * (`FEAT-001`), so the browser never holds or sends an account reference at all.
 *
 * As on the join flow, every exit is a redirect. A refusal writes the submitted values and one
 * cause token into the flow's cookies, and the redirected render turns it into the state the
 * screen file declares. A success writes the session cookie the use case handed back (`C-006`,
 * `NFR-026`), clears the flow, and follows the member's return path.
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  completeSignIn,
  readCode,
  readReturnTo,
  readSession,
  readTelephone,
  requestSignInCode,
  type CompleteSignInResult,
  type IdentityFailure,
  type MemberSessionRead,
  type RequestSignInCodeResult,
  type SignedOutSession,
} from '@odp/domain';
import { newCorrelationId } from '../../../lib/logging';
import { resolveLocale } from '../../../lib/i18n/locale';
import { getSignInDependencies } from '../../../lib/session/deps';
import {
  clearSignInPending,
  clearSignInRetry,
  clearSignInStatus,
  readSignInPending,
  writeSignInPending,
  writeSignInRetry,
  writeSignInStatus,
  type SignInPendingState,
  type SignInStatus,
  type SignInStatusState,
} from '../../../lib/session/sign-in-cookies';
import {
  clearMemberSessionCookie,
  presentedMemberSessionToken,
  setMemberSessionCookie,
} from '../../../lib/session/session-cookies';
import { emptyJoinFormValues, writeJoinRetry } from '../../../lib/identity/join-cookies';

/** Reads the number and the return path off the wire, as the visitor typed them. */
function readForm(formData: FormData): { telephoneNumber: string; returnTo: string } {
  const value = (key: string): string => {
    const raw = formData.get(key);
    return typeof raw === 'string' ? raw : '';
  };
  return { telephoneNumber: value('telephoneNumber'), returnTo: value('returnTo') };
}

/** The source address the limiter counts against, never logged and never stored raw (`NFR-027`). */
async function requestAddress(): Promise<string> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  // An absent header still needs a subject so the limiter can count; the adapter digests it.
  return 'unknown';
}

/** One limiter consult that keeps a store failure apart from a refusal, as the join flow does. */
async function consultAddressCap(
  ports: Awaited<ReturnType<typeof getSignInDependencies>>,
  address: string,
): Promise<
  | { readonly refused: false }
  | { readonly refused: true; readonly retryAfterSeconds: number | null }
> {
  try {
    const outcome = await ports.rateLimits.consume({
      bucket: 'sign_in_address',
      subject: { kind: 'address', value: address },
    });
    return outcome.allowed
      ? { refused: false }
      : { refused: true, retryAfterSeconds: outcome.retryAfterSeconds };
  } catch {
    // A limiter that cannot answer is a degraded service, not an admission (`NFR-027`).
    return { refused: true, retryAfterSeconds: null };
  }
}

/** Holds a refused number attempt for the redirected render, with the typed number intact. */
async function holdNumberAttempt(
  telephoneNumber: string,
  refusal: {
    readonly fields?: Readonly<Record<string, string>>;
    readonly status?: SignInStatus;
    readonly retryAfterSeconds?: number;
  },
): Promise<void> {
  await writeSignInRetry({
    values: { telephoneNumber },
    fields: refusal.fields ?? {},
    ...(refusal.status === undefined ? {} : { status: refusal.status }),
    ...(refusal.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: refusal.retryAfterSeconds }),
  });
}

/**
 * A browser that still presents a session token it can no longer use.
 *
 * The screen renders the session-ended line for it (`screens/02` Expired session), and the next
 * write — this action — drops the dead token, so the browser stops presenting it (`NFR-026`; a
 * render cannot set cookies, only an action can). A live member session is honoured instead: the
 * member is sent on their way rather than signed out of a session they did not ask to end.
 */
async function settlePresentedSession(
  ports: Awaited<ReturnType<typeof getSignInDependencies>>,
  returnTo: string,
): Promise<void> {
  const token = await presentedMemberSessionToken();
  if (token === null) return;
  let resolved: MemberSessionRead | SignedOutSession | null;
  try {
    const result = await readSession(ports, { memberSessionToken: token });
    // Only the member namespace was presented, so a staff answer cannot occur; a degraded store
    // is not an answer either: the token is left alone and sign-in still proceeds.
    resolved = result.ok && result.staff === null ? result : null;
  } catch {
    resolved = null;
  }
  if (resolved === null) return;
  if (resolved.signedIn) {
    await clearSignInPending();
    await clearSignInRetry();
    await clearSignInStatus();
    redirect(returnTo);
  }
  await clearMemberSessionCookie();
}

/** One refused attempt as a status payload: the cause token plus the counts the contract carries. */
function statusOf(refusal: {
  readonly status?: SignInStatus;
  readonly retryAfterSeconds?: number;
}): Omit<SignInStatusState, 'at'> {
  return {
    cause: refusal.status ?? 'DEGRADED',
    ...(refusal.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: refusal.retryAfterSeconds }),
  };
}

/**
 * Maps a `C-005` refusal onto the state grain the screen renders.
 *
 * The screen's states name them: the per-number wait (with the time remaining), a dispatch the
 * channel could not take (with the number kept, ready to retry), and everything else degraded —
 * nothing was created, nothing was sent.
 */
function numberRefusal(failure: IdentityFailure): {
  readonly status?: SignInStatus;
  readonly retryAfterSeconds?: number;
} {
  if (failure.code === 'RATE_LIMITED') {
    return {
      status: 'RATE_LIMITED',
      ...(failure.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: failure.retryAfterSeconds }),
    };
  }
  if (failure.code === 'SERVICE_DEGRADED' && failure.cause === 'SMS_CHANNEL_UNAVAILABLE') {
    return { status: 'DELIVERY_FAILED' };
  }
  return { status: 'DEGRADED' };
}

/** Rewrites the pending pointer from one `C-005` answer, keeping the member's return path. */
function pendingFromResult(
  result: Extract<RequestSignInCodeResult, { ok: true }>,
  telephoneNumber: string,
  returnTo: string,
): SignInPendingState {
  return {
    challengeId: result.signInChallengeId,
    telephoneNumber,
    returnTo,
    resendAvailableAt: result.codeDelivery.resendAvailableAt,
  };
}

/**
 * Requests a sign-in code for the number entered (`C-005`).
 *
 * The form posts here with or without scripting; every exit is a redirect, so the no-scripting
 * path answers exactly as the enhanced one does. A number no account uses routes to registration
 * with the entered number intact — the contract's own recovery path (`NO_ACCOUNT_FOR_NUMBER`,
 * `meta.recoveryPath:"/join"`).
 */
export async function requestSignInCodeAction(formData: FormData): Promise<void> {
  const values = readForm(formData);
  const returnTo = readReturnTo(values.returnTo);
  const destination = returnTo.ok ? returnTo.value : '/';

  const ports = await getSignInDependencies();

  // A member who reaches sign-in with a live session is sent back where they came from; a dead
  // token is dropped here, at the write, because a render cannot clear cookies.
  await settlePresentedSession(ports, destination);

  // `C-005`/`NFR-027`: a cap is per number (the domain consults it inside the use case) and per
  // source address. Only the transport knows the address, so the address bucket is this action's.
  const address = await consultAddressCap(ports, await requestAddress());
  if (address.refused) {
    await holdNumberAttempt(values.telephoneNumber, {
      status: 'RATE_LIMITED',
      ...(address.retryAfterSeconds === null
        ? {}
        : { retryAfterSeconds: address.retryAfterSeconds }),
    });
    redirect('/sign-in');
  }

  const reading = readTelephone(values.telephoneNumber);
  if (!reading.ok) {
    // The field's own reasons (`C-005` `fields:{"telephoneNumber":[...]}`), mapped onto the
    // control that produced them, with the typed text kept.
    await holdNumberAttempt(values.telephoneNumber, {
      fields: { [reading.field]: reading.reason },
    });
    redirect('/sign-in');
  }

  const correlationId = newCorrelationId();
  const result: RequestSignInCodeResult = await requestSignInCode(
    { kind: 'public', locale: await resolveLocale(), correlationId },
    ports,
    { telephoneNumber: reading.value },
  );

  if (!result.ok) {
    if (result.code === 'NOT_FOUND' && result.cause === 'NO_ACCOUNT_FOR_NUMBER') {
      // No account on this number: the contract's recovery path is registration. The entered
      // number travels in the join flow's retry cookie, so the form the visitor lands on holds it
      // (`screens/02` Exit Points: Registration Form, without losing the number).
      await clearSignInPending();
      await clearSignInStatus();
      await clearSignInRetry();
      await writeJoinRetry({
        values: { ...emptyJoinFormValues(), telephoneNumber: values.telephoneNumber },
        fields: {},
      });
      redirect('/join');
    }
    await holdNumberAttempt(values.telephoneNumber, numberRefusal(result));
    redirect('/sign-in');
  }

  // The code is on its way: the flow's place is this challenge, and the screen renders the code
  // step from the pending pointer.
  await clearSignInRetry();
  await clearSignInStatus();
  await writeSignInPending(pendingFromResult(result, reading.value, destination));
  redirect('/sign-in');
}

/**
 * Requests one new code for the number already in the flow (`C-005` again).
 *
 * The action takes no argument: the pending pointer's number is the only one it may re-request
 * for, and the use case owns the per-number cap and the one-minute spacing. Used by the code
 * step's resend control, including after an expired code, where the challenge record is already
 * gone and the pointer's number is what survives.
 */
export async function resendSignInCodeAction(): Promise<void> {
  const pending = await readSignInPending();
  if (pending === null) redirect('/sign-in');

  const ports = await getSignInDependencies();
  const correlationId = newCorrelationId();

  const result: RequestSignInCodeResult = await requestSignInCode(
    { kind: 'public', locale: await resolveLocale(), correlationId },
    ports,
    { telephoneNumber: pending.telephoneNumber },
  );

  if (!result.ok) {
    await writeSignInStatus(statusOf(numberRefusal(result)));
    redirect('/sign-in');
  }

  // A fresh code is on its way: the pointer moves to the new challenge, and the countdown
  // restarts from the new answer.
  await clearSignInStatus();
  await writeSignInPending(pendingFromResult(result, pending.telephoneNumber, pending.returnTo));
  redirect('/sign-in');
}

/**
 * Maps a `C-006` refusal onto the status grain the code step renders.
 *
 * The screen's states name the causes: an incorrect code (with the tries remaining), the cooldown
 * after the tries are used up, an expired code (with the resend as the lead action), and a code that
 * already opened a session. A challenge the store no longer holds — expired, or consumed by an
 * earlier confirmation — renders as the expired state, which is the same recovery either way: a
 * fresh code.
 */
function confirmRefusal(failure: IdentityFailure): Omit<SignInStatusState, 'at'> {
  switch (failure.cause) {
    case 'CODE_INCORRECT':
      return {
        cause: 'CODE_INCORRECT',
        ...(failure.attemptsRemaining === undefined
          ? {}
          : { attemptsRemaining: failure.attemptsRemaining }),
      };
    case 'CODE_ATTEMPTS_EXCEEDED':
      return {
        cause: 'CODE_ATTEMPTS_EXCEEDED',
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      };
    case 'CODE_EXPIRED':
    case 'SIGN_IN_CHALLENGE_EXPIRED':
      return { cause: 'CODE_EXPIRED' };
    case 'CODE_ALREADY_USED':
      return { cause: 'CODE_ALREADY_USED' };
    default:
      // `MEMBER_NOT_FOUND` and the degraded answers are integrity refusals the UI cannot invite:
      // nothing changed, and the member either retries or re-requests a code.
      return { cause: 'DEGRADED' };
  }
}

/**
 * Proves the code and opens the session for the account that holds the number (`C-006`).
 *
 * The challenge resolves the one account (`FEAT-001`), so no account reference is posted or read.
 */
export async function completeSignInAction(formData: FormData): Promise<void> {
  const pending = await readSignInPending();
  if (pending === null) redirect('/sign-in'); // No flow this browser started: start at the number.

  const ports = await getSignInDependencies();
  const correlationId = newCorrelationId();
  const code = String(formData.get('code') ?? '');

  const reading = readCode(code);
  if (!reading.ok) {
    // The field's own reasons (`C-006` `fields:{"code":[...]}`); the render maps them onto the
    // code control and clears nothing — the digits were refused, exactly as the screen states.
    // `readCode` answers only these two reasons; the catalogue has a sentence for each.
    await writeSignInStatus({
      cause: reading.reason as 'REQUIRED' | 'PATTERN_MISMATCH',
    });
    redirect('/sign-in');
  }

  const result: CompleteSignInResult = await completeSignIn(
    { kind: 'public', correlationId },
    ports,
    {
      signInChallengeId: pending.challengeId,
      code: reading.value,
      returnTo: pending.returnTo,
    },
  );

  if (!result.ok) {
    await writeSignInStatus(confirmRefusal(result));
    redirect('/sign-in');
  }

  // The session is open: the cookie is the session's own answer (`C-006`, `NFR-026`), set by the
  // action and never by the client, and the member returns where they came from.
  if (result.cookie !== undefined) {
    await setMemberSessionCookie(result.cookie);
  }
  await clearSignInPending();
  await clearSignInRetry();
  await clearSignInStatus();
  redirect(result.returnTo);
}

/**
 * Returns the visitor to the number step.
 *
 * No contract entry owns this write — it clears the flow's pointer so the code step stops
 * rendering, and the screen file's "Use a different number" control posts to it. A form post, not
 * a link, because a plain navigation would land on the code step again while the cookie holds.
 */
export async function useDifferentNumberAction(): Promise<void> {
  await clearSignInPending();
  await clearSignInStatus();
  redirect('/sign-in');
}
