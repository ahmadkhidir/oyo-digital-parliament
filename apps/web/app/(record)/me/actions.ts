'use server';

/**
 * The My Record actions (`C-033`, `C-034`, `C-035`, `screens/13-my-record.md`).
 *
 * One exported action per contract entry the screen's forms post to:
 *
 * - `correctMyDetailsAction` — the correction form and the footer's language switch both reach
 *   `C-033`; a language-only post takes the member's current display and full name from the
 *   record, because the entry rewrites all three fields together.
 * - `updateConsentAction` — one optional purpose per call (`C-034`).
 * - `createDataRequestAction` — the export and deletion forms (`C-035`); the request carries its
 *   type and nothing else, because `DataRequest` has no column for a note.
 *
 * Every exit is a redirect, which keeps the no-scripting form path working: a refusal re-renders
 * the screen with a fixed reason token, and a refused correction also leaves its values in the
 * server-side echo so the member does not retype them. No personal value enters a URL.
 *
 * The session is resolved again here; the proxy's redirect is advisory and cannot reach the
 * session store (`apps/web/AGENTS.md` Discipline).
 */
import { createHash, randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  correctMyDetails,
  createDataRequest,
  updateConsent,
  type CorrectMyDetailsResult,
  type CreateDataRequestResult,
  type IdentityFailure,
  type UpdateConsentResult,
} from '@odp/domain';
import { newCorrelationId } from '../../../lib/logging';
import { LOCALE_COOKIE, readLocaleValue } from '../../../lib/i18n/locale';
import { presentedMemberSessionToken } from '../../../lib/session/session-cookies';
import {
  readConsentSubmission,
  readCorrectionSubmission,
  readDataRequestSubmission,
} from './_lib/forms';
import { recordEchoKey, saveRecordEcho } from './_lib/echo';
import { getMyRecordRuntime, resolveMyRecordSession, type MyRecordSession } from './_lib/runtime';

/** The screen, and the sign-in door that returns here after a session is opened. */
const SCREEN_PATH = '/me';
const SIGN_IN_PATH = '/sign-in?returnTo=%2Fme';

/** The SHA-256 of a UTF-8 string, hex-encoded, used to name the correction echo. */
function digestOf(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Writes the locale cookie so the entry screens follow an account's language. */
async function rememberLocale(locale: string): Promise<void> {
  const value = readLocaleValue(locale);
  if (value === null) return;
  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: true,
  });
}

/** The member the action acts for, or the redirect that stops it. */
async function requireMember(): Promise<Extract<MyRecordSession, { kind: 'member' }>> {
  const token = await presentedMemberSessionToken();
  const session = await resolveMyRecordSession(token);
  if (session.kind === 'degraded') redirect(`${SCREEN_PATH}?e=degraded`);
  if (session.kind === 'signed-out') redirect(SIGN_IN_PATH);
  return session;
}

/** The token a refused correction leaves, given the `C-001` code it answered with. */
function correctionErrorToken(failure: IdentityFailure): string {
  switch (failure.code) {
    case 'RATE_LIMITED':
      return 'details_rate_limited';
    case 'VALIDATION_FAILED':
      return 'details_invalid';
    default:
      return 'details_failed';
  }
}

/**
 * Saves the caller's own display name, full name and language (`C-033`).
 *
 * @param formData - The three fields, the form's intent and its opaque echo key.
 */
export async function correctMyDetailsAction(formData: FormData): Promise<void> {
  const submission = readCorrectionSubmission(formData);
  const token = await presentedMemberSessionToken();
  const session = await resolveMyRecordSession(token);

  // A language-only post from the footer of a signed-out visit is a preference, not an account
  // write: the entry screens' convention holds it for the session (`C-039`).
  if (session.kind !== 'member') {
    if (session.kind === 'degraded') redirect(`${SCREEN_PATH}?e=degraded`);
    if (readLocaleValue(submission.locale) !== null) await rememberLocale(submission.locale);
    redirect(SCREEN_PATH);
  }

  const { ports } = await getMyRecordRuntime();
  let displayName = submission.displayName;
  let fullName = submission.fullName;

  if (submission.mode === 'language') {
    // `C-033` rewrites all three fields; a language switch keeps the two names on the record.
    const member = await ports.members.get(session.member.id).catch(() => null);
    if (member === null) redirect(`${SCREEN_PATH}?e=degraded`);
    displayName = member.displayName;
    fullName = member.fullName;
  }

  const correlationId = newCorrelationId();
  const result: CorrectMyDetailsResult = await correctMyDetails(
    {
      kind: 'member',
      memberId: session.member.id,
      sessionId: session.token,
      correlationId,
    },
    ports,
    { displayName, fullName, locale: submission.locale },
  );

  if (!result.ok) {
    if (result.code === 'UNAUTHENTICATED') {
      redirect(SIGN_IN_PATH);
    }
    const echoKey = digestOf(submission.echoKey === '' ? randomUUID() : submission.echoKey);
    if (submission.mode === 'details') {
      await saveRecordEcho((await getMyRecordRuntime()).platform.cache, recordEchoKey(echoKey), {
        displayName,
        fullName,
        locale: submission.locale,
        fields: result.fields,
      });
    }
    const token = correctionErrorToken(result);
    const key = submission.mode === 'details' ? `&k=${echoKey}` : '';
    redirect(`${SCREEN_PATH}?e=${token}${key}`);
  }

  // The member's locale is authoritative once signed in (`C-001` Locale), so the entry screens
  // follow the account rather than the browser's earlier anonymous choice.
  await rememberLocale(result.member.locale);

  const retained =
    result.previousDisplayNameRetainedOn.submissions +
      result.previousDisplayNameRetainedOn.comments >
    0;
  const status =
    submission.mode === 'language'
      ? 'language_saved'
      : retained
        ? 'details_saved_retained'
        : 'details_saved';
  redirect(`${SCREEN_PATH}?st=${status}`);
}

/**
 * Grants or withdraws one optional consent (`C-034`).
 *
 * @param formData - The purpose and the toggle's answer.
 */
export async function updateConsentAction(formData: FormData): Promise<void> {
  const submission = readConsentSubmission(formData);
  if (submission.purpose === null || submission.granted === null) {
    redirect(`${SCREEN_PATH}?e=consent_failed`);
  }

  const session = await requireMember();

  const { ports } = await getMyRecordRuntime();
  const result: UpdateConsentResult = await updateConsent(
    {
      kind: 'member',
      memberId: session.member.id,
      sessionId: session.token,
      correlationId: newCorrelationId(),
    },
    ports,
    { purpose: submission.purpose, granted: submission.granted },
  );

  if (!result.ok) {
    if (result.code === 'UNAUTHENTICATED') redirect(SIGN_IN_PATH);
    // `C-034` refuses a change that is already in force; that is not an error to shout about.
    if (result.code === 'CONFLICT_ALREADY_DECIDED') {
      redirect(`${SCREEN_PATH}?st=consent_unchanged`);
    }
    redirect(`${SCREEN_PATH}?e=consent_failed`);
  }

  redirect(`${SCREEN_PATH}?st=consent_saved`);
}

/**
 * Records an export or deletion request (`C-035`), or reports the one already open.
 *
 * @param formData - The request type and the render's opaque idempotency key.
 */
export async function createDataRequestAction(formData: FormData): Promise<void> {
  const submission = readDataRequestSubmission(formData);
  if (submission.type === null) redirect(`${SCREEN_PATH}?e=request_failed`);

  const session = await requireMember();

  const { ports } = await getMyRecordRuntime();
  const result: CreateDataRequestResult = await createDataRequest(
    {
      kind: 'member',
      memberId: session.member.id,
      sessionId: session.token,
      correlationId: newCorrelationId(),
    },
    ports,
    {
      type: submission.type,
      ...(submission.idempotencyKey === '' ? {} : { idempotencyKey: submission.idempotencyKey }),
    },
  );

  if (!result.ok) {
    if (result.code === 'UNAUTHENTICATED') redirect(SIGN_IN_PATH);
    if (result.cause === 'DUPLICATE_EXPORT_REQUEST') {
      redirect(`${SCREEN_PATH}?st=export_open`);
    }
    redirect(`${SCREEN_PATH}?e=request_failed`);
  }

  if (result.queued) redirect(`${SCREEN_PATH}?st=request_queued`);

  // `C-035`: a legal hold is explained at once, with the date it is next reviewed. The date is a
  // campaign working date, never personal data, so it may travel in the redirect.
  if (result.legalHoldDetected) {
    const review = result.legalHoldReviewAt;
    redirect(
      `${SCREEN_PATH}?st=request_held${review === null ? '' : `&d=${encodeURIComponent(review)}`}`,
    );
  }

  const status =
    submission.type === 'export'
      ? 'export_requested'
      : submission.type === 'deletion'
        ? 'deletion_requested'
        : 'request_queued';
  redirect(`${SCREEN_PATH}?st=${status}`);
}
