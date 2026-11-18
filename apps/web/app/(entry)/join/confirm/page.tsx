/**
 * Number Confirmation — `docs/OyoDigitalParliament/screens/04-number-confirmation.md`, wired to
 * `C-003` and `C-004` (`apps/web/app/(entry)/join/confirm/actions.ts`).
 *
 * The screen states resolve on the server from the pending record this browser holds and the one
 * outcome the last action left behind:
 *
 * - **Awaiting input** — the number in full, the code field, the resend availability, the note.
 * - **Submitting** — the client form's own state: field locked, spinner.
 * - **Incorrect** — the inline sentence with the attempts remaining, the field cleared.
 * - **Expired** — the code window closed: the inline message, the resend as the lead action.
 * - **Cooling down** — the resend timer, stated as time remaining (live when scripting is on).
 * - **Delivery delayed** — the static note: what to do when no code arrives, and that the pending
 *   registration is held until the 24-hour window closes.
 * - **Offline** — the banner; confirm disabled with the reason; the pending registration preserved.
 *
 * A visitor whose pending registration has expired is sent back to the form with the notice, and a
 * visitor with no registration here at all is sent to `/join` directly — the screen is only
 * reachable with a record this browser created.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { isPast, resendAvailableAt, toIsoSeconds, type PendingRegistration } from '@odp/domain';
import { getMessages, type Messages } from '../../../../messages';
import type { LaunchLocale } from '../../../../messages';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { formatWait, interpolate } from '../../../../lib/i18n/format';
import { getIdentityDependencies } from '../../../../lib/identity/ports';
import { readConfirmStatus, readJoinPending } from '../../../../lib/identity/join-cookies';
import { ConfirmCodeForm, ResendCodeForm } from './_shared/confirmation-form';
import { confirmRegistrationAction, resendRegistrationCodeAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).confirm.title };
}

/** One outcome the screen renders, with the parts each state needs. */
interface ConfirmOutcome {
  readonly role: 'alert' | 'status';
  readonly message: string;
  /** The code control's own failure sentence, when the digits themselves were refused. */
  readonly codeError?: string;
  /** The alternative the refusal offers, when it has one. */
  readonly link?: { readonly href: string; readonly label: string };
  /** Whether the resend becomes the screen's lead action (`screens/04` Expired state). */
  readonly resendLead?: boolean;
}

/**
 * Builds the outcome sentence from the cause the last action left behind.
 *
 * The cause tokens are the stable `C-003`/`C-004` tokens plus the code field's own reasons; the
 * durations and counts the contracts carry (`retryAfterSeconds`, `attemptsRemaining`) are
 * formatted here, once, into the sentence the catalogue wrote.
 */
function outcomeOf(
  copy: Messages['confirm'],
  wait: Messages['wait'],
  locale: LaunchLocale,
  cause: string,
  attemptsRemaining: number | undefined,
  retryAfterSeconds: number | undefined,
  number: string,
): ConfirmOutcome {
  const after = (seconds: number | undefined): string => formatWait(wait, locale, seconds ?? 60);
  switch (cause) {
    case 'REQUIRED':
    case 'PATTERN_MISMATCH':
      // The field's own failure: the sentence sits under the code control (`NFR-044`), where the
      // `role="alert"` announcement and the association are already wired.
      return { role: 'alert', message: '', codeError: copy.codeErrors[cause] };
    case 'CODE_INCORRECT': {
      // `C-003` carries the attempts remaining on the refusal; the sentence states it, and it
      // belongs to the control it failed, so it renders there rather than as a page notice.
      const attempts = attemptsRemaining ?? 2;
      return {
        role: 'alert',
        message: '',
        codeError: attempts <= 1 ? copy.incorrectOne : interpolate(copy.incorrectTwo, { attempts }),
      };
    }
    case 'CODE_ATTEMPTS_EXCEEDED':
      return {
        role: 'alert',
        message: interpolate(copy.attemptsExhausted, { duration: after(retryAfterSeconds) }),
      };
    case 'CODE_EXPIRED':
      return { role: 'alert', message: copy.expired, resendLead: true };
    case 'RESEND_FAILED':
      return { role: 'alert', message: copy.resendFailed };
    case 'RESEND_COOLDOWN':
      return {
        role: 'alert',
        message: interpolate(copy.resendRateLimited, { duration: after(retryAfterSeconds) }),
      };
    case 'RESEND_CAP':
      return {
        role: 'alert',
        message: interpolate(copy.resendCapReached, { duration: after(retryAfterSeconds) }),
      };
    case 'RESENT':
      return { role: 'status', message: interpolate(copy.resendSent, { number }) };
    case 'CODE_ALREADY_USED':
      return {
        role: 'alert',
        message: copy.alreadyUsed,
        link: { href: '/sign-in', label: copy.signIn },
      };
    default:
      // A degraded service and anything unanticipated: nothing changed, the record is held.
      return { role: 'alert', message: copy.degraded };
  }
}

export default async function ConfirmPage() {
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.confirm;

  const pointer = await readJoinPending();
  if (pointer === null) {
    // The screen is only meaningful with a record this browser created (`screens/04` entry points).
    redirect('/join');
  }

  const { ports } = await getIdentityDependencies();
  const now = toIsoSeconds(ports.clock.now());
  const pending: PendingRegistration | null = await ports.pendingRegistrations.findById(pointer.id);

  if (pending === null || isPast(pending.expiresAt, now)) {
    // A stale pointer: the held form ran out of its 24 hours. The screen says so and hands the
    // visitor back to a fresh form; nothing is prefilled, because nothing is held.
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-lg px-md py-xl">
        <h1 className="text-h1 text-text-primary">{copy.heading}</h1>
        <div role="alert" className="border border-border bg-surface px-md py-sm text-body">
          <p>{copy.expiredRegistration}</p>
          <a
            href="/join"
            className="mt-xs inline-block text-small text-primary-500 underline underline-offset-2"
          >
            {copy.backToForm}
          </a>
        </div>
      </div>
    );
  }

  const status = await readConfirmStatus();
  const outcome =
    status === null
      ? null
      : outcomeOf(
          copy,
          messages.wait,
          locale,
          status.cause,
          status.attemptsRemaining,
          status.retryAfterSeconds,
          pending.telephoneNumber,
        );

  // The number is shown in full so a mistake is visible immediately (`screens/04` Visual Focus);
  // it is the visitor's own held record, shown to the visitor alone.
  const numberIntro = interpolate(pointer.delayed ? copy.numberIntroHeld : copy.numberIntro, {
    number: pending.telephoneNumber,
  });

  // The resend timer restarts from the record's latest dispatch (`C-004`); the client counts the
  // remainder live, and without scripting the static note explains the wait.
  const availableAt =
    pending.codeSentAt === undefined ? undefined : resendAvailableAt(pending.codeSentAt);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-lg px-md py-xl">
      <h1 className="text-h1 text-text-primary">{copy.heading}</h1>
      <p className="text-body text-text-primary">{numberIntro}</p>

      {outcome !== null && (outcome.message !== '' || outcome.link !== undefined) ? (
        <div
          role={outcome.role}
          className="border border-border bg-surface px-md py-sm text-body text-text-primary"
        >
          {outcome.message === '' ? null : <p>{outcome.message}</p>}
          {outcome.link === undefined ? null : (
            <a
              href={outcome.link.href}
              className="mt-xs inline-block text-small text-primary-500 underline underline-offset-2"
            >
              {outcome.link.label}
            </a>
          )}
        </div>
      ) : null}

      <ConfirmCodeForm
        action={confirmRegistrationAction}
        copy={{
          offline: copy.offline,
          offlineSubmit: copy.offlineSubmit,
          code: {
            label: copy.codeLabel,
            hint: copy.codeHint,
            ...(outcome?.codeError === undefined ? {} : { error: outcome.codeError }),
          },
          confirm: copy.confirm,
          confirming: copy.confirming,
        }}
      />

      {/* The delivery note: what to do when no code arrives, and that the form is held (`screens/04`). */}
      <p className="text-small text-text-secondary">{copy.deliveryNote}</p>

      <ResendCodeForm
        action={resendRegistrationCodeAction}
        copy={{
          resend: copy.resend,
          resending: copy.resending,
          offline: copy.offline,
          offlineSubmit: copy.resendOffline,
          countdown: copy.resendCountdown,
          countdownReady: copy.resendReady,
          staticNote: copy.resendStaticNote,
        }}
        locale={locale}
        wait={messages.wait}
        variant={outcome?.resendLead === true ? 'primary' : 'secondary'}
        {...(availableAt === undefined ? {} : { availableAt })}
      />

      {/* Change number: back to the registration form, which prefills the held values. */}
      <a href="/join" className="text-small text-primary-500 underline underline-offset-2">
        {copy.changeNumber}
      </a>
    </div>
  );
}
