/**
 * Staff Sign In — `docs/OyoDigitalParliament/screens/24-staff-sign-in.md`, wired to `C-092`
 * (`app/(admin)/staff/sign-in/actions.ts`).
 *
 * The states the file declares render here: Default, Validation, Submitting (the form's own client
 * state), Invalid credentials, Locked, Delivery failure, Session ended and Already signed in. A
 * signed-in staff member never sees a second form: a satisfied session redirects to `/admin`, and a
 * challenge still owing its factor redirects to `/staff/2fa`.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Notice, focusRingClasses } from '@odp/ui';
import { getMessages } from '../../../../messages';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { formatWait } from '../../../../lib/i18n/format';
import { readStaffAccess } from '../../../../lib/staff-session/session';
import { readStaffFlow, type StaffFlowState } from '../../../../lib/staff-session/cookies';
import { StaffAuthScreen } from '../_shell/staff-auth-screen';
import { StaffSignInForm } from './_shared/staff-sign-in-form';
import { beginStaffSignInAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).staff.signIn.title };
}

/** The sentence one flow cause states on this screen. */
function outcomeOf(
  flow: StaffFlowState,
  copy: ReturnType<typeof getMessages>['staff']['signIn'],
  wait: ReturnType<typeof getMessages>['wait'],
  locale: Awaited<ReturnType<typeof resolveLocale>>,
): { readonly tone: 'error' | 'warning' | 'info'; readonly message: string } | null {
  if (flow.notice === 'PASSWORD_REQUIRED') {
    return { tone: 'info', message: copy.passwordRequired };
  }
  if (flow.notice === 'SESSION_ENDED') {
    return { tone: 'info', message: copy.sessionEnded };
  }
  switch (flow.cause) {
    case 'VALIDATION':
      return { tone: 'error', message: copy.validation };
    case 'STAFF_CREDENTIALS_INVALID':
      return { tone: 'error', message: copy.invalid };
    case 'ACCOUNT_LOCKED': {
      const clearsAt =
        flow.lockedUntil === undefined
          ? formatWait(wait, locale, flow.retryAfterSeconds ?? 1800)
          : new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(
              new Date(flow.lockedUntil),
            );
      return { tone: 'warning', message: copy.locked.replace('{time}', clearsAt) };
    }
    case 'STAFF_INACTIVE':
      return { tone: 'error', message: copy.help };
    case 'MEMBER_SESSION_PRESENT':
      return { tone: 'error', message: copy.memberSession };
    case 'STAFF_SIGN_IN_RATE_LIMITED':
      return {
        tone: 'warning',
        message: copy.locked.replace(
          '{time}',
          formatWait(wait, locale, flow.retryAfterSeconds ?? 60),
        ),
      };
    case 'DEGRADED':
      return { tone: 'error', message: copy.deliveryFailed };
    default:
      return null;
  }
}

export default async function StaffSignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const access = await readStaffAccess();
  if (access.kind === 'ready') redirect('/admin');
  if (access.kind === 'challenge') redirect('/staff/2fa');

  const query = await searchParams;
  const ended = query['ended'] === '1';
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.staff.signIn;
  const flow = await readStaffFlow();
  const outcome = flow === null ? null : outcomeOf(flow, copy, messages.wait, locale);

  const usernameError = flow?.cause === 'VALIDATION' ? copy.usernameError : undefined;

  return (
    <StaffAuthScreen
      productName={messages.brand.name}
      title={copy.heading}
      disclosure={messages.footer.disclosure}
      aside={
        <a
          href="/sign-in"
          className={`inline-flex min-h-button items-center text-small text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
        >
          {copy.residentLink}
        </a>
      }
    >
      <p className="max-w-prose text-body text-text-primary">{copy.accessNote}</p>

      {access.kind === 'degraded' ? (
        <Notice role="alert" tone="error">
          {copy.deliveryFailed}
        </Notice>
      ) : null}

      {ended && access.kind !== 'degraded' ? (
        <Notice role="status" tone="info">
          {copy.sessionEnded}
        </Notice>
      ) : null}

      {outcome !== null ? (
        <Notice role={outcome.tone === 'info' ? 'status' : 'alert'} tone={outcome.tone}>
          {outcome.message}
        </Notice>
      ) : null}

      <StaffSignInForm
        action={beginStaffSignInAction}
        copy={{
          username: { label: copy.username.label, hint: copy.username.hint, ...(usernameError === undefined ? {} : { error: usernameError }) },
          password: { label: copy.password.label, hint: copy.password.hint },
          submit: copy.submit,
          submitting: copy.submitting,
          offline: copy.deliveryFailed,
          offlineSubmit: copy.submit,
        }}
        defaultUsername={flow?.username}
      />

      <div className="flex flex-col gap-xs border-t border-border pt-md">
        <p className="text-small text-text-secondary">{copy.help}</p>
        <p className="text-caption text-text-secondary">{copy.note}</p>
      </div>
    </StaffAuthScreen>
  );
}
