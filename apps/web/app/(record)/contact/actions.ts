'use server';

/**
 * The Contact screen's language write (`screens.md` Footer; `C-039`, `C-033`, `C-001`).
 *
 * The shared Footer's switch is a plain form, so it works with scripting disabled. On a visit
 * without a member session the choice is held for the session and applied to a pending
 * registration, exactly as the entry screens hold it (`C-039`). On a member's visit the account's
 * locale is authoritative, so the choice is written to the account through the `C-033` correction
 * with the two names the record already holds — the contract rewrites all three fields together.
 * Either way the reader returns to this screen in the language they chose.
 *
 * A malformed `X-Correlation-Id` is refused with the `C-001` failure envelope before the locale is
 * read or anything is written, like every other action surface; a value outside the two launch
 * locales is ignored rather than guessed at.
 */
import { correctMyDetails, type CorrectMyDetailsResult } from '@odp/domain';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  actionRefusal,
  readActionRequest,
  type ActionFailureEnvelope,
} from '../../../lib/http/rate-limit';
import { LOCALE_COOKIE, readLocaleValue } from '../../../lib/i18n/locale';
import { presentedMemberSessionToken } from '../../../lib/session/session-cookies';
import { getMyRecordRuntime, resolveMyRecordSession } from '../me/_lib/runtime';

/** The screen the switch returns to. */
const SCREEN_PATH = '/contact';

/** Writes the session-scoped choice the entry screens and this one follow (`C-039`). */
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

/**
 * Saves the caller's language and returns to the screen.
 *
 * @param formData - The `locale` field the footer's switch posts.
 */
export async function changeLocaleAction(formData: FormData): Promise<void>;
export async function changeLocaleAction(
  formData: FormData,
): Promise<ActionFailureEnvelope | void> {
  const request = await readActionRequest();
  if (!request.correlation.ok) {
    return actionRefusal(request.correlation, request.rateLimit) ?? undefined;
  }

  const locale = readLocaleValue(String(formData.get('locale') ?? ''));
  if (locale === null) redirect(SCREEN_PATH);

  const token = await presentedMemberSessionToken();
  const session = await resolveMyRecordSession(token);

  // No member session (or a session the store could not answer for): the choice is a preference for
  // this visit, not an account write.
  if (session.kind !== 'member') {
    await rememberLocale(locale);
    redirect(SCREEN_PATH);
  }

  const { ports } = await getMyRecordRuntime();
  const member = await ports.members.get(session.member.id).catch(() => null);
  if (member === null) {
    await rememberLocale(locale);
    redirect(SCREEN_PATH);
  }

  const result: CorrectMyDetailsResult = await correctMyDetails(
    {
      kind: 'member',
      memberId: session.member.id,
      sessionId: session.token,
      correlationId: request.correlation.correlationId,
    },
    ports,
    { displayName: member.displayName, fullName: member.fullName, locale },
  );

  if (result.ok) await rememberLocale(result.member.locale);
  redirect(SCREEN_PATH);
}
