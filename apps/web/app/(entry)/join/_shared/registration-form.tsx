'use client';

/**
 * The registration form (`screens/03-registration-form.md`).
 *
 * This is the screen's one client boundary, and it exists for the states a server render cannot
 * carry: the submit indicator with the fields locked (`Submitting`), the display-name preview as
 * it is typed, and the offline banner with the primary control disabled (`Offline`). With
 * scripting disabled the same markup posts as a plain form to the same server action, and a
 * failed attempt re-renders with every value still in its field - the defaults below are exactly
 * what the flow's retry cookie held back.
 *
 * The four entries are numbered in the margin as a register numbers its lines; the ordinal is
 * decorative and hidden from the accessibility tree. The display-name preview reads as the proof
 * line it is: the one string that will appear on the record.
 *
 * All copy arrives already translated and formatted; the page owns the catalogue and the
 * interpolation of durations and counts. Nothing here reads a session, a store or the network
 * beyond the form post itself.
 */
import { interpolate } from '../../../../lib/i18n/format';
import type { JoinFormValues } from '../../../../lib/identity/join-cookies';
import { Notice, type NoticeTone } from '@odp/ui';
import { ErrorSummary, FlowField } from './field';
import { GuardedSubmit, OfflineNote } from './offline';
import { useOffline } from './use-offline';
import { useFormStatus } from 'react-dom';
import { useState } from 'react';

/** The four fields' copy, each field's failure sentence included when it failed. */
export interface RegistrationFieldCopy {
  label: string;
  hint: string;
  /** Present when the field failed its rule; the sentence is already chosen by the page. */
  error?: string | undefined;
}

export interface RegistrationCopy {
  offline: string;
  offlineSubmit: string;
  sendCode: string;
  sending: string;
  /** Marker rendered beside the display-name label (`screens/03`: the field is optional). */
  optional: string;
  fields: {
    fullName: RegistrationFieldCopy;
    declaredAge: RegistrationFieldCopy;
    telephoneNumber: RegistrationFieldCopy;
    displayName: RegistrationFieldCopy;
  };
  /** `Will appear as: {name}` - the preview template, interpolated here as the name is typed. */
  previewTyped: string;
  previewBlank: string;
}

/** One whole-attempt outcome, already worded by the page. */
export interface RegistrationStatus {
  /** `status` for an informational outcome, `alert` for a refusal. */
  role: 'status' | 'alert';
  /** The tone that names the kind of news; the sentence remains the reason. */
  tone: NoticeTone;
  /** A strong first line, when the state leads with one (`screens/03` Delivery failed). */
  heading?: string | undefined;
  message: string;
  /** The alternative the refusal offers, such as sign-in for an already-registered number. */
  link?: { href: string; label: string } | undefined;
}

export interface JoinRegistrationFormProps {
  /** The `C-002` server action, shared by the enhanced and the no-scripting paths. */
  action: (formData: FormData) => void | Promise<void>;
  /** What the visitor last typed, kept across a failed attempt or a returned visit. */
  defaults: JoinFormValues;
  copy: RegistrationCopy;
  /** The whole-attempt message, or `null` on the default screen. */
  status: RegistrationStatus | null;
  /** The failing fields, named for the summary; the per-field sentences live in `copy.fields`. */
  summary: { heading: string; items: readonly { href: string; label: string }[] } | null;
}

/** The form's body, inside the form element, where the pending and offline states are readable. */
function RegistrationFormBody({
  defaults,
  copy,
  status,
  summary,
}: Omit<JoinRegistrationFormProps, 'action'>) {
  const offline = useOffline();
  const { pending } = useFormStatus();
  const [displayName, setDisplayName] = useState(defaults.displayName);
  const locked = pending || offline;

  return (
    <>
      {offline ? <OfflineNote message={copy.offline} /> : null}

      {status === null ? null : (
        <Notice
          role={status.role}
          tone={status.tone}
          {...(status.heading === undefined ? {} : { title: status.heading })}
        >
          <p>{status.message}</p>
          {status.link === undefined ? null : (
            <a
              href={status.link.href}
              className="mt-xs inline-flex min-h-button items-center text-small underline underline-offset-2 hover:no-underline"
            >
              {status.link.label}
            </a>
          )}
        </Notice>
      )}

      {summary === null ? null : <ErrorSummary heading={summary.heading} items={summary.items} />}

      <fieldset disabled={locked} className="mt-lg flex flex-col gap-xl border-0 p-0">
        <FlowField
          id="fullName"
          index="01"
          label={copy.fields.fullName.label}
          hint={copy.fields.fullName.hint}
          error={copy.fields.fullName.error}
          input={{
            name: 'fullName',
            type: 'text',
            autoComplete: 'name',
            required: true,
            maxLength: 160,
            defaultValue: defaults.fullName,
          }}
        />
        <FlowField
          id="declaredAge"
          index="02"
          label={copy.fields.declaredAge.label}
          hint={copy.fields.declaredAge.hint}
          error={copy.fields.declaredAge.error}
          input={{
            name: 'declaredAge',
            type: 'number',
            inputMode: 'numeric',
            min: 18,
            max: 35,
            required: true,
            defaultValue: defaults.declaredAge,
          }}
        />
        <FlowField
          id="telephoneNumber"
          index="03"
          label={copy.fields.telephoneNumber.label}
          hint={copy.fields.telephoneNumber.hint}
          error={copy.fields.telephoneNumber.error}
          input={{
            name: 'telephoneNumber',
            type: 'tel',
            autoComplete: 'tel',
            inputMode: 'tel',
            required: true,
            defaultValue: defaults.telephoneNumber,
          }}
        />
        <div className="flex gap-sm tablet:gap-md">
          <span
            aria-hidden="true"
            className="w-xl shrink-0 pt-xs font-display text-small tabular-nums text-text-secondary"
          >
            04
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-xs">
            <FlowField
              id="displayName"
              label={
                <>
                  {copy.fields.displayName.label}{' '}
                  <span className="text-small font-normal text-text-secondary">
                    ({copy.optional})
                  </span>
                </>
              }
              hint={copy.fields.displayName.hint}
              error={copy.fields.displayName.error}
              input={{
                name: 'displayName',
                type: 'text',
                autoComplete: 'nickname',
                maxLength: 60,
                defaultValue: defaults.displayName,
                onChange: (event) => setDisplayName(event.currentTarget.value),
              }}
            />
            {/* The preview beneath the display name (`screens/03`): how the name will be published. */}
            <div className="mt-xs border-s border-border ps-sm">
              <p
                aria-live="polite"
                className={
                  displayName === ''
                    ? 'text-small text-text-secondary'
                    : 'font-display text-h3 text-text-primary'
                }
              >
                {displayName === ''
                  ? copy.previewBlank
                  : interpolate(copy.previewTyped, { name: displayName })}
              </p>
            </div>
          </div>
        </div>
      </fieldset>

      {/* The write closes the entry: on a phone the action stays at the foot of the screen. */}
      <div className="sticky bottom-0 z-10 -mx-lg mt-lg border-t border-border bg-surface px-lg py-md tablet:static tablet:mx-0 tablet:border-t-0 tablet:bg-transparent tablet:p-0">
        <GuardedSubmit
          variant="primary"
          className="w-full"
          label={copy.sendCode}
          sendingLabel={copy.sending}
          offlineLabel={copy.offlineSubmit}
        />
      </div>
    </>
  );
}

export function JoinRegistrationForm({
  action,
  defaults,
  copy,
  status,
  summary,
}: JoinRegistrationFormProps) {
  return (
    <form action={action}>
      <RegistrationFormBody defaults={defaults} copy={copy} status={status} summary={summary} />
    </form>
  );
}
