'use client';

/**
 * The sign-in forms (`screens/02-sign-in.md`).
 *
 * One client module — the screen's client boundary, justified by the same states a server render
 * cannot carry: the submit indicator with the control locked (`Submitting`), the offline banner
 * (`Offline`), and the resend countdown (`Code step`). With scripting disabled both forms post as
 * plain requests to their server actions, the code field is always empty on arrival (a wrong code
 * clears the field, as the confirmation screen states), and the countdown shows as the static note.
 *
 * The account choice is a plain radio group: the ordinals the member picks are the only thing the
 * browser holds — the accounts themselves stay on the server (`C-005` reveals the count, never the
 * names, and no member identifier enters the client).
 *
 * All copy arrives already translated; the countdown formats its own live numbers through the
 * shared helpers, so the catalogue does not ship with the client bundle.
 */
import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { FlowField } from '../../join/_shared/field';
import { GuardedSubmit, OfflineNote } from '../../join/_shared/offline';
import { useOffline } from '../../join/_shared/use-offline';
import { formatWait, interpolate, type WaitTemplates } from '../../../../lib/i18n/format';
import type { LaunchLocale } from '../../../../messages';

export interface SignInNumberCopy {
  offline: string;
  offlineSubmit: string;
  /** The telephone field's copy, its failure sentence included when the number was refused. */
  telephoneNumber: { label: string; hint: string; error?: string | undefined };
  sendCode: string;
  sending: string;
}

export interface SignInNumberFormProps {
  /** The `C-005` server action. */
  action: (formData: FormData) => void | Promise<void>;
  copy: SignInNumberCopy;
  /** The internal path the member came from, carried through the code request (`C-006`). */
  returnTo?: string | undefined;
  /** The number a refused attempt kept, so the field is never emptied by a refusal. */
  defaultValue?: string | undefined;
}

/** The number form's body, inside the form element, where pending and offline are readable. */
function SignInNumberBody({
  copy,
  defaultValue,
}: {
  copy: SignInNumberCopy;
  defaultValue?: string | undefined;
}) {
  const offline = useOffline();
  const { pending } = useFormStatus();
  return (
    <>
      {offline ? <OfflineNote message={copy.offline} /> : null}
      <fieldset disabled={offline || pending} className="border-0 p-0">
        <FlowField
          id="telephoneNumber"
          label={copy.telephoneNumber.label}
          hint={copy.telephoneNumber.hint}
          error={copy.telephoneNumber.error}
          input={{
            name: 'telephoneNumber',
            type: 'tel',
            inputMode: 'tel',
            autoComplete: 'tel',
            required: true,
            // The submitted number survives a refusal (`screens/02`, the typed text kept).
            ...(defaultValue === undefined ? {} : { defaultValue }),
          }}
        />
      </fieldset>
      <div className="mt-lg">
        <GuardedSubmit
          variant="secondary"
          label={copy.sendCode}
          sendingLabel={copy.sending}
          offlineLabel={copy.offlineSubmit}
        />
      </div>
    </>
  );
}

export function SignInNumberForm({ action, copy, returnTo, defaultValue }: SignInNumberFormProps) {
  return (
    <form action={action}>
      {returnTo === undefined ? null : <input type="hidden" name="returnTo" value={returnTo} />}
      <SignInNumberBody copy={copy} defaultValue={defaultValue} />
    </form>
  );
}

export interface SignInCodeCopy {
  offline: string;
  offlineSubmit: string;
  /** The code control's copy, its failure sentence included when the digits were refused. */
  code: { label: string; hint: string; error?: string | undefined };
  /** The account-choice group's copy, present only when the number is shared. */
  choice?: { legend: string; option: string } | undefined;
  confirm: string;
  confirming: string;
}

export interface SignInCodeFormProps {
  /** The `C-006` server action. */
  action: (formData: FormData) => void | Promise<void>;
  copy: SignInCodeCopy;
  /** How many accounts share the number, when the member must choose. */
  accountCount?: number | undefined;
}

/** The code form's body, inside the form element, where pending and offline are readable. */
function SignInCodeBody({
  copy,
  accountCount,
}: {
  copy: SignInCodeCopy;
  accountCount?: number | undefined;
}) {
  const offline = useOffline();
  const { pending } = useFormStatus();
  const locked = offline || pending;
  const choice = copy.choice;
  const count = accountCount;
  return (
    <>
      {offline ? <OfflineNote message={copy.offline} /> : null}
      {choice !== undefined && count !== undefined && count > 1 ? (
        <fieldset disabled={locked} className="border-0 p-0">
          {/* The explicit choice before sign-in (`screens/02` Account choice; FEAT-001: a shared
              number never signs in automatically). Ordinal labels only: the names stay on the
              server until the code is accepted (`C-005` Authority). */}
          <legend className="text-body-strong text-text-primary">{choice.legend}</legend>
          <div className="mt-sm flex flex-col gap-xs">
            {Array.from({ length: count }, (_, index) => (
              <label
                key={index + 1}
                className="flex items-center gap-sm rounded-md border border-border bg-surface px-md py-sm text-body text-text-primary"
              >
                <input
                  type="radio"
                  name="memberId"
                  value={String(index + 1)}
                  required
                  className="size-5 shrink-0 accent-primary-700"
                />
                {interpolate(choice.option, { position: index + 1, count })}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset disabled={locked} className="mt-lg border-0 p-0">
        <FlowField
          id="code"
          label={copy.code.label}
          hint={copy.code.hint}
          error={copy.code.error}
          input={{
            name: 'code',
            type: 'text',
            inputMode: 'numeric',
            autoComplete: 'one-time-code',
            required: true,
            // Six digits, numeric keypad on touch (`screens/02`). No default value: the field is
            // empty whenever this screen renders, including after a wrong attempt.
            maxLength: 6,
          }}
        />
      </fieldset>
      <div className="mt-lg">
        <GuardedSubmit
          variant="primary"
          label={copy.confirm}
          sendingLabel={copy.confirming}
          offlineLabel={copy.offlineSubmit}
        />
      </div>
    </>
  );
}

export function SignInCodeForm({ action, copy, accountCount }: SignInCodeFormProps) {
  return (
    <form action={action}>
      <SignInCodeBody copy={copy} accountCount={accountCount} />
    </form>
  );
}

export interface SignInResendCopy {
  resend: string;
  resending: string;
  offline: string;
  offlineSubmit: string;
  /** `You can ask for a new code in {duration}.` — the live countdown template. */
  countdown: string;
  countdownReady: string;
  /** The static sentence shown without scripting, or before hydration. */
  staticNote: string;
}

export interface SignInResendFormProps {
  /** The `C-005` server action the resend posts to. */
  action: (formData: FormData) => void | Promise<void>;
  copy: SignInResendCopy;
  /** The instant a new code may be requested, when one is cooling down. */
  availableAt?: string | undefined;
  locale: LaunchLocale;
  wait: WaitTemplates;
  /** The control's variant: the lead action when the code has expired (`screens/02`). */
  variant: 'primary' | 'secondary';
}

/** Whole seconds still to wait before `availableAt`, from the client's own clock. */
function remainingSeconds(availableAt: string, nowMs: number): number {
  const end = Date.parse(availableAt);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - nowMs) / 1000));
}

/**
 * The cooldown sentence.
 *
 * The live count starts after hydration: before that — and without scripting — the static note
 * holds the place, which is also what the server render shows, so the two agree. The count is not
 * a live region; it changes every second, and announcing each one is noise (`NFR-044`).
 */
function ResendCountdown({
  availableAt,
  locale,
  wait,
  copy,
}: {
  availableAt: string;
  locale: LaunchLocale;
  wait: WaitTemplates;
  copy: SignInResendCopy;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    const tick = (): number => remainingSeconds(availableAt, Date.now());
    setRemaining(tick());
    const timer = setInterval(() => {
      const next = tick();
      setRemaining(next);
      if (next <= 0) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [availableAt]);

  if (remaining === null || remaining <= 0) {
    const settled = remaining !== null && remaining <= 0;
    return (
      <p className="text-small text-text-secondary" data-countdown={settled ? 'ready' : 'pending'}>
        {settled ? copy.countdownReady : copy.staticNote}
      </p>
    );
  }
  return (
    <p className="text-small text-text-secondary" data-countdown="cooling">
      {interpolate(copy.countdown, { duration: formatWait(wait, locale, remaining) })}
    </p>
  );
}

export function SignInResendForm({
  action,
  copy,
  availableAt,
  locale,
  wait,
  variant,
}: SignInResendFormProps) {
  return (
    <form action={action}>
      {availableAt === undefined ? (
        <p className="text-small text-text-secondary">{copy.staticNote}</p>
      ) : (
        <ResendCountdown availableAt={availableAt} locale={locale} wait={wait} copy={copy} />
      )}
      <div className="mt-sm">
        <GuardedSubmit
          variant={variant}
          label={copy.resend}
          sendingLabel={copy.resending}
          offlineLabel={copy.offlineSubmit}
        />
      </div>
    </form>
  );
}

/**
 * The "use a different number" control (`screens/02`).
 *
 * It is a form posting to a server action rather than a link, because returning to the number step
 * must clear the pending pointer — a plain navigation would land on the code step again, since the
 * cookie still holds it. A form post works with scripting disabled.
 */
export interface SignInChangeNumberProps {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
}

export function SignInChangeNumberForm({ action, label }: SignInChangeNumberProps) {
  return (
    <form action={action}>
      <button type="submit" className="text-small text-primary-500 underline underline-offset-2">
        {label}
      </button>
    </form>
  );
}
