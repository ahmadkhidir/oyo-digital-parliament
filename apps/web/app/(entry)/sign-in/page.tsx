/**
 * Sign In - `docs/OyoDigitalParliament/screens/02-sign-in.md`, wired to `C-005` and `C-006`
 * (`apps/web/app/(entry)/sign-in/actions.ts`).
 *
 * The screen's two steps render from the flow's cookies and the presented session, resolved on
 * the server:
 *
 * - **Default** - the number field and the send action, with the code-arrival note.
 * - **Submitting** - the client form's own state: send disabled with a spinner.
 * - **Code step** - the six-digit field, the resend timer, the change-number control.
 * - **Account choice** - the explicit choice the member makes before a session opens; the
 *   accounts are the challenge's own, named only by position, because the contract reveals the
 *   count of a shared number and never its names before the code is accepted (`C-005` Authority).
 * - **Validation error** - each failing field named under its control, the typed text kept.
 * - **Incorrect code** - the inline sentence with the tries remaining, the field cleared.
 * - **Expired** - the code window closed: the inline message, the resend as the lead action.
 * - **Delivery failed** - the inline message with the send action as the retry.
 * - **Rate limited** - the wait before another attempt, stated as time remaining.
 * - **Expired session** - one line explaining the session ended, then the number field.
 * - **Offline** - the banner; the action disabled with the reason, the typed values preserved.
 *
 * A signed-in member who reaches this screen is sent back where they came from; a browser whose
 * cookie names no live session sees the one-line explanation and the number field (`NFR-026`).
 *
 * The screen is the register's returning door: the title row names the door, the margin index
 * shows the other one, and the code step gives the six digits the width of the page's focus.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  isPast,
  readReturnTo,
  readSession,
  toIsoSeconds,
  type MemberSessionRead,
  type SignedOutSession,
} from '@odp/domain';
import { focusRingClasses, Notice, type NoticeTone } from '@odp/ui';
import { getMessages, type Messages } from '../../../messages';
import type { LaunchLocale } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { formatWait, interpolate } from '../../../lib/i18n/format';
import { getSignInDependencies } from '../../../lib/session/deps';
import {
  readSignInPending,
  readSignInRetry,
  readSignInStatus,
  type SignInStatusState,
} from '../../../lib/session/sign-in-cookies';
import { presentedMemberSessionToken } from '../../../lib/session/session-cookies';
import { EntryIndex } from '../_shell/entry-index';
import { EntryScreen } from '../_shell/entry-screen';
import {
  SignInChangeNumberForm,
  SignInCodeForm,
  SignInNumberForm,
  SignInResendForm,
} from './_shared/sign-in-forms';
import {
  completeSignInAction,
  requestSignInCodeAction,
  resendSignInCodeAction,
  useDifferentNumberAction,
} from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).signIn.title };
}

/** One outcome the screen renders, with the parts each state needs. */
interface SignInOutcome {
  readonly role: 'alert' | 'status';
  readonly tone: NoticeTone;
  readonly message: string;
  /** The code control's own failure sentence, when the digits themselves were refused. */
  readonly codeError?: string;
  /** The choice group's own failure sentence, when no account was named. */
  readonly choiceError?: string;
  /** Whether the resend becomes the screen's lead action (`screens/02` Expired state). */
  readonly resendLead?: boolean;
}

/**
 * Builds the outcome sentence from the cause the last action left behind.
 *
 * The cause tokens are the stable `C-005`/`C-006` tokens plus the code field's own reasons; the
 * durations and counts the contracts carry (`retryAfterSeconds`, `attemptsRemaining`) are
 * formatted here, once, into the sentence the catalogue wrote.
 */
function outcomeOf(
  copy: Messages['signIn'],
  wait: Messages['wait'],
  locale: LaunchLocale,
  status: SignInStatusState,
): SignInOutcome {
  const after = (seconds: number | undefined): string => formatWait(wait, locale, seconds ?? 60);
  switch (status.cause) {
    case 'REQUIRED':
    case 'PATTERN_MISMATCH':
      // The code field's own failure: the sentence sits under the control (`NFR-044`), where the
      // `role="alert"` announcement and the association are already wired.
      return {
        role: 'alert',
        tone: 'error',
        message: '',
        codeError: copy.codeErrors[status.cause],
      };
    case 'CODE_INCORRECT': {
      // `C-006` carries the tries remaining on the refusal; the sentence states it, and it
      // belongs to the control it failed, so it renders there rather than as a page notice.
      const attempts = status.attemptsRemaining ?? 2;
      return {
        role: 'alert',
        tone: 'error',
        message: '',
        codeError: attempts <= 1 ? copy.incorrectOne : interpolate(copy.incorrectTwo, { attempts }),
      };
    }
    case 'CODE_ATTEMPTS_EXCEEDED':
      return {
        role: 'alert',
        tone: 'warning',
        message: interpolate(copy.attemptsExhausted, { duration: after(status.retryAfterSeconds) }),
      };
    case 'CODE_EXPIRED':
      return { role: 'alert', tone: 'warning', message: copy.codeExpired, resendLead: true };
    case 'CODE_ALREADY_USED':
      return { role: 'alert', tone: 'warning', message: copy.codeAlreadyUsed, resendLead: true };
    case 'ACCOUNT_CHOICE_REQUIRED':
      return {
        role: 'alert',
        tone: 'error',
        message: '',
        choiceError: copy.choiceRequired,
      };
    case 'DELIVERY_FAILED':
      return { role: 'alert', tone: 'error', message: copy.sendFailed };
    case 'RATE_LIMITED':
      return {
        role: 'alert',
        tone: 'warning',
        message: interpolate(copy.rateLimited, { duration: after(status.retryAfterSeconds) }),
      };
    default:
      // A degraded service and anything unanticipated: nothing changed, the flow is held.
      return { role: 'alert', tone: 'error', message: copy.degraded };
  }
}

/** The `C-007` read behind the expired-session check; `null` when the store could not answer. */
async function readSessionQuietly(
  ports: Awaited<ReturnType<typeof getSignInDependencies>>,
  token: string,
): Promise<MemberSessionRead | SignedOutSession | null> {
  try {
    const result = await readSession(ports, { memberSessionToken: token });
    // Only the member namespace was presented, so a staff answer cannot occur; a degraded store
    // is not an answer: the screen renders its default rather than a verdict.
    return result.ok && result.staff === null ? result : null;
  } catch {
    return null;
  }
}

/** The page's own props: only the query is read, for the return path the member came from. */
interface SignInPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.signIn;

  // The return path is a query parameter on the entry links (`screens.md` Record Header prompt,
  // the sign-in prompt on any screen); only an internal path is accepted.
  const query = await searchParams;
  const requested = query['returnTo'];
  const rawReturnTo = typeof requested === 'string' ? requested : '';
  const returnTo = readReturnTo(rawReturnTo);
  const destination = returnTo.ok ? returnTo.value : '/';

  const ports = await getSignInDependencies();

  // The presented session decides the screen's first state: a live member is sent on their way,
  // and a token that names no live session earns the one-line explanation (`NFR-026`).
  const token = await presentedMemberSessionToken();
  let sessionEnded = false;
  if (token !== null) {
    const read = await readSessionQuietly(ports, token);
    if (read !== null) {
      if (read.signedIn) redirect(destination);
      sessionEnded = true;
    }
  }

  const pending = await readSignInPending();
  const retry = await readSignInRetry();
  const status = await readSignInStatus();

  const index = (
    <EntryIndex
      items={[
        { id: 'sign-in', label: copy.heading, current: true },
        { id: 'join', label: messages.join.heading, href: '/join' },
      ]}
    />
  );

  const frame = {
    title: copy.heading,
    tagline: messages.brand.tagline,
    disclosure: messages.footer.disclosure,
    index,
  };

  if (pending === null) {
    // The number step. The typed number survives a refusal; the session-ended line, when this
    // browser presented a dead token, sits above the field (`screens/02` Expired session).
    // A refusal the number step itself answered - the wait, a dispatch the channel could not
    // take - travels in the retry cookie beside the values; a resend's outcome would only land
    // here if its pointer had already gone, which its action guards against.
    const outcome =
      status !== null
        ? outcomeOf(copy, messages.wait, locale, status)
        : retry !== null && retry.status !== undefined
          ? outcomeOf(copy, messages.wait, locale, {
              at: retry.at,
              cause: retry.status,
              ...(retry.retryAfterSeconds === undefined
                ? {}
                : { retryAfterSeconds: retry.retryAfterSeconds }),
            })
          : null;
    const numberError =
      retry?.fields['telephoneNumber'] === undefined
        ? undefined
        : copy.telephoneNumber.errors[
            retry.fields['telephoneNumber'] as keyof typeof copy.telephoneNumber.errors
          ];

    return (
      <EntryScreen {...frame}>
        <p className="max-w-prose text-body text-text-primary">{copy.intro}</p>

        {sessionEnded ? (
          <Notice role="status" tone="info">
            {copy.sessionEnded}
          </Notice>
        ) : null}

        {outcome !== null && outcome.message !== '' ? (
          <Notice role={outcome.role} tone={outcome.tone}>
            {outcome.message}
          </Notice>
        ) : null}

        <SignInNumberForm
          action={requestSignInCodeAction}
          copy={{
            offline: copy.offline,
            offlineSubmit: copy.offlineSend,
            telephoneNumber: {
              label: copy.telephoneNumber.label,
              hint: copy.telephoneNumber.hint,
              ...(numberError === undefined ? {} : { error: numberError }),
            },
            sendCode: copy.sendCode,
            sending: copy.sending,
          }}
          returnTo={destination === '/' ? undefined : destination}
          defaultValue={retry?.values.telephoneNumber}
        />

        {/* The other door: a visitor without an account goes to registration (`screens/02`). */}
        <p className="border-t border-border pt-md text-small text-text-secondary">
          {copy.createAccountPrompt}{' '}
          <a
            href="/join"
            className={`inline-flex min-h-button items-center text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
          >
            {copy.createAccount}
          </a>
        </p>
      </EntryScreen>
    );
  }

  // The code step. The expired state is decided here too: a pointer whose challenge the store no
  // longer holds - the window closed, or the code was already used - renders the expired message
  // with the resend as the lead action, which is the same recovery either way.
  const now = toIsoSeconds(ports.clock.now());
  const challenge = await ports.signInChallenges.findById(pending.challengeId);
  const challengeLive = challenge !== null && !isPast(challenge.expiresAt, now);

  const outcome =
    status !== null
      ? outcomeOf(copy, messages.wait, locale, status)
      : challengeLive
        ? null
        : {
            role: 'alert' as const,
            tone: 'warning' as const,
            message: copy.codeExpired,
            resendLead: true,
          };

  // The number is shown in full so a mistake is visible immediately (`screens/02` Visual Focus);
  // it is the number this browser asked for, shown to this browser alone.
  const numberIntro = interpolate(copy.codeIntro, { number: pending.telephoneNumber });
  const sharedIntro = interpolate(copy.sharedIntro, { number: pending.telephoneNumber });

  return (
    <EntryScreen {...frame}>
      <p className="max-w-prose text-body text-text-primary">
        {pending.accountChoiceRequired ? sharedIntro : numberIntro}
      </p>

      {outcome !== null && (outcome.message !== '' || outcome.choiceError !== undefined) ? (
        <Notice role={outcome.role} tone={outcome.tone}>
          {outcome.message === '' ? null : <p>{outcome.message}</p>}
          {outcome.choiceError === undefined ? null : <p>{outcome.choiceError}</p>}
        </Notice>
      ) : null}

      <SignInCodeForm
        action={completeSignInAction}
        copy={{
          offline: copy.offline,
          offlineSubmit: copy.offlineConfirm,
          code: {
            label: copy.code.label,
            hint: copy.code.hint,
            ...(outcome?.codeError === undefined ? {} : { error: outcome.codeError }),
          },
          ...(pending.accountChoiceRequired && copy.accountChoice !== undefined
            ? { choice: { legend: copy.accountChoice.legend, option: copy.accountChoice.option } }
            : {}),
          confirm: copy.confirm,
          confirming: copy.confirming,
        }}
        accountCount={pending.accountChoiceRequired ? pending.accountCount : undefined}
        confirmVariant={outcome?.resendLead === true ? 'outline' : 'primary'}
      />

      {/* The delivery note: what to do when no code arrives (`screens/02`). */}
      <p className="max-w-prose text-small text-text-secondary">{copy.deliveryNote}</p>

      <SignInResendForm
        action={resendSignInCodeAction}
        copy={{
          resend: copy.resend,
          resending: copy.resending,
          offline: copy.offline,
          offlineSubmit: copy.offlineResend,
          countdown: copy.resendCountdown,
          countdownReady: copy.resendReady,
          staticNote: copy.resendStaticNote,
        }}
        locale={locale}
        wait={messages.wait}
        variant={outcome?.resendLead === true ? 'primary' : 'outline'}
        {...(pending.resendAvailableAt === undefined
          ? {}
          : { availableAt: pending.resendAvailableAt })}
      />

      <div className="border-t border-border pt-sm">
        <SignInChangeNumberForm action={useDifferentNumberAction} label={copy.useDifferentNumber} />
      </div>
    </EntryScreen>
  );
}
