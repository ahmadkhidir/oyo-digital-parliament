'use client';

/**
 * The registration form (`screens/03-registration-form.md`).
 *
 * This is the screen's one client boundary, and it exists for the states a server render cannot
 * carry: the submit indicator with the fields locked (`Submitting`), the display-name preview as
 * it is typed, and the offline banner with the primary control disabled (`Offline`). With
 * scripting disabled the same markup posts as a plain form to the same server action, and a
 * failed attempt re-renders with every value still in its field — the defaults below are exactly
 * what the flow's retry cookie held back.
 *
 * All copy arrives already translated and formatted; the page owns the catalogue and the
 * interpolation of durations and counts. Nothing here reads a session, a store or the network
 * beyond the form post itself.
 */
import { interpolate } from '../../../../lib/i18n/format';
import type { JoinFormValues } from '../../../../lib/identity/join-cookies';
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
  /** `Will appear as: {name}` — the preview template, interpolated here as the name is typed. */
  previewTyped: string;
  previewBlank: string;
}

/** One whole-attempt outcome, already worded by the page. */
export interface RegistrationStatus {
  /** `status` for an informational outcome, `alert` for a refusal. */
  role: 'status' | 'alert';
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
        <div
          role={status.role}
          className="border border-border bg-surface px-md py-sm text-body text-text-primary"
        >
          {status.heading === undefined ? null : (
            <p className="text-body-strong text-text-primary">{status.heading}</p>
          )}
          <p>{status.message}</p>
          {status.link === undefined ? null : (
            <a
              href={status.link.href}
              className="mt-xs inline-block text-small text-primary-500 underline underline-offset-2"
            >
              {status.link.label}
            </a>
          )}
        </div>
      )}

      {summary === null ? null : <ErrorSummary heading={summary.heading} items={summary.items} />}

      <fieldset disabled={locked} className="mt-lg flex flex-col gap-lg border-0 p-0">
        <FlowField
          id="fullName"
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
        <div className="flex flex-col gap-xs">
          <FlowField
            id="displayName"
            label={
              <>
                {copy.fields.displayName.label}{' '}
                <span className="text-small text-text-secondary">({copy.optional})</span>
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
          <p className="text-small text-text-secondary" aria-live="polite">
            {displayName === ''
              ? copy.previewBlank
              : interpolate(copy.previewTyped, { name: displayName })}
          </p>
        </div>
      </fieldset>

      <div className="mt-lg">
        <GuardedSubmit
          variant="primary"
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
