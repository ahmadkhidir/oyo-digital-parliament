'use client';

/**
 * The number-confirmation forms (`screens/04-number-confirmation.md`).
 *
 * Two forms, one client module — the screen's client boundary, justified by the same three states
 * a server render cannot carry: the submit indicator with the control locked (`Submitting`), the
 * offline banner with the action disabled (`Offline`), and the resend countdown (`Cooling down`).
 * With scripting disabled both forms post as plain requests to their server actions, the code
 * field is always empty on arrival (`screens/04`: a wrong code clears the field), and the resend
 * cooldown shows as the static note instead of a live count.
 *
 * All copy arrives already translated; the countdown formats its own live numbers through the
 * shared helpers, so the catalogue does not ship with the client bundle.
 */
import { useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { type ButtonVariant } from '@odp/ui';
import { FlowField } from '../../_shared/field';
import { GuardedSubmit, OfflineNote } from '../../_shared/offline';
import { useOffline } from '../../_shared/use-offline';
import { formatWait, interpolate, type WaitTemplates } from '../../../../../lib/i18n/format';
import type { LaunchLocale } from '../../../../../messages';

export interface ConfirmCodeCopy {
  offline: string;
  offlineSubmit: string;
  /** The code control's copy, its failure sentence included when the digits were refused. */
  code: { label: string; hint: string; error?: string | undefined };
  confirm: string;
  confirming: string;
}

export interface ConfirmCodeFormProps {
  /** The `C-003` server action. */
  action: (formData: FormData) => void | Promise<void>;
  copy: ConfirmCodeCopy;
  /** The confirm control's variant; it yields to the resend when the code has expired. */
  confirmVariant?: ButtonVariant;
}

/** The form's body, inside the form element, where pending and offline are readable. */
function ConfirmCodeBody({
  copy,
  confirmVariant,
}: {
  copy: ConfirmCodeCopy;
  confirmVariant: ButtonVariant;
}) {
  const offline = useOffline();
  const { pending } = useFormStatus();
  return (
    <>
      {offline ? <OfflineNote message={copy.offline} /> : null}
      <fieldset disabled={offline || pending} className="border-0 p-0">
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
            // Six digits, numeric keypad on touch (`screens/04`). No default value: the field is
            // empty whenever this screen renders, including after a wrong attempt.
            maxLength: 6,
            // The digits are the focus of the step: set in the display face, centred, tabular.
            className: 'text-center font-display text-h1 tabular-nums',
          }}
        />
      </fieldset>
      <div className="mt-lg">
        <GuardedSubmit
          variant={confirmVariant}
          className="w-full"
          label={copy.confirm}
          sendingLabel={copy.confirming}
          offlineLabel={copy.offlineSubmit}
        />
      </div>
    </>
  );
}

export function ConfirmCodeForm({
  action,
  copy,
  confirmVariant = 'primary',
}: ConfirmCodeFormProps) {
  return (
    <form action={action}>
      <ConfirmCodeBody copy={copy} confirmVariant={confirmVariant} />
    </form>
  );
}

export interface ResendCopy {
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

export interface ResendCodeFormProps {
  /** The `C-004` server action. */
  action: (formData: FormData) => void | Promise<void>;
  copy: ResendCopy;
  /** The instant a new code may be requested, when one is cooling down. */
  availableAt?: string;
  locale: LaunchLocale;
  wait: WaitTemplates;
  /** The control's variant: the lead action when the code has expired (`screens/04`). */
  variant: ButtonVariant;
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
  copy: ResendCopy;
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

export function ResendCodeForm({
  action,
  copy,
  availableAt,
  locale,
  wait,
  variant,
}: ResendCodeFormProps) {
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
          className="w-full tablet:w-auto"
          label={copy.resend}
          sendingLabel={copy.resending}
          offlineLabel={copy.offlineSubmit}
        />
      </div>
    </form>
  );
}
