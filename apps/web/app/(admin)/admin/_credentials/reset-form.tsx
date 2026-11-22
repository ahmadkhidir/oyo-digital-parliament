'use client';

/**
 * The Staff credentials form and its confirmation (`C-093`, `screens/26-admin-home.md`).
 *
 * This is the one client boundary on Admin Home, and it exists for two interactions a plain form post
 * cannot express: the reset control stays disabled until a staff member is chosen, and Reset opens a
 * confirmation dialog that names the staff member, states that their sessions end and that they must
 * enrol a second factor again. With scripting disabled both interactions degrade to the plain form:
 * the radio group is `required`, so the browser refuses to submit before a staff member is chosen, and
 * Reset posts directly. The dialog is native `<dialog>`, so focus is trapped and returned to the
 * control that opened it without a modal implementation here.
 */
import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, focusRingClasses } from '@odp/ui';
import { useOffline } from '../../../(entry)/join/_shared/use-offline';

/** One staff row as the panel renders it: label strings arrive already translated. */
export interface ResetTargetView {
  readonly id: string;
  readonly fullName: string;
  readonly roleLabel: string;
  readonly activeLabel: string;
  readonly factorLabel: string;
}

/** The panel copy the form needs. Every sentence arrives translated. */
export interface ResetFormCopy {
  readonly choose: string;
  readonly newPassword: string;
  readonly newPasswordHint: string;
  readonly reason: string;
  readonly reasonHint: string;
  readonly reset: string;
  readonly resetting: string;
  readonly offline: string;
  readonly confirmHeading: string;
  readonly confirmBody: string;
  readonly confirm: string;
  readonly cancel: string;
}

/** The button inside the dialog, so `useFormStatus` sees the write it starts. */
function ConfirmButton({
  label,
  sendingLabel,
}: {
  readonly label: string;
  readonly sendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button variant="primary" type="submit" isLoading={pending}>
      {pending ? sendingLabel : label}
    </Button>
  );
}

export interface ResetFormProps {
  readonly action: (formData: FormData) => Promise<void>;
  readonly copy: ResetFormCopy;
  readonly targets: readonly ResetTargetView[];
  /** Whether the form may be used: false while the browser is offline. */
  readonly offlineLabel: string;
}

export function ResetForm({ action, copy, targets, offlineLabel }: ResetFormProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [enhanced, setEnhanced] = useState(false);
  const offline = useOffline();
  const selected = targets.find((target) => target.id === selectedId) ?? null;
  useEffect(() => {
    setEnhanced(true);
  }, []);
  // The server render leaves the control enabled so a browser without scripting can still post the
  // form; once hydrated, an unchosen target or a lost connection disables it with its reason stated.
  const blocked = enhanced && (offline || selected === null);

  return (
    <form action={action} className="flex flex-col gap-md">
      <fieldset className="flex flex-col gap-sm">
        <legend className="text-body text-text-primary">{copy.choose}</legend>
        <ul className="flex flex-col divide-y divide-border border-y border-border">
          {targets.map((target) => (
            <li
              key={target.id}
              className="flex min-h-button items-start gap-sm px-sm py-sm hover:bg-surface-muted"
            >
              <input
                id={`reset-target-${target.id}`}
                type="radio"
                name="staffUserId"
                value={target.id}
                required
                checked={selectedId === target.id}
                onChange={() => setSelectedId(target.id)}
                className="mt-xs size-4 shrink-0"
              />
              <label
                htmlFor={`reset-target-${target.id}`}
                className="flex cursor-pointer flex-col gap-xs"
              >
                <span className="text-body text-text-primary">{target.fullName}</span>
                <span className="text-small text-text-secondary">
                  {target.roleLabel} · {target.factorLabel} · {target.activeLabel}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-col gap-xs">
        <label htmlFor="new-password" className="text-small text-text-primary">
          {copy.newPassword}
        </label>
        <input
          id="new-password"
          name="newPassword"
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          aria-describedby="new-password-hint"
          className="min-h-button rounded-sm border border-border bg-surface px-sm text-body text-text-primary"
        />
        <p id="new-password-hint" className="text-caption text-text-secondary">
          {copy.newPasswordHint}
        </p>
      </div>

      <div className="flex flex-col gap-xs">
        <label htmlFor="reset-reason" className="text-small text-text-primary">
          {copy.reason}
        </label>
        <textarea
          id="reset-reason"
          name="reason"
          rows={3}
          required
          maxLength={500}
          aria-describedby="reset-reason-hint"
          className="rounded-sm border border-border bg-surface px-sm py-xs text-body text-text-primary"
        />
        <p id="reset-reason-hint" className="text-caption text-text-secondary">
          {copy.reasonHint}
        </p>
      </div>

      <button
        type="submit"
        disabled={blocked}
        aria-disabled={blocked || undefined}
        onClick={(event) => {
          if (selected === null || offline) {
            event.preventDefault();
            return;
          }
          // Hold the post back until the operator confirms the named staff member in the dialog.
          event.preventDefault();
          dialog.current?.showModal();
        }}
        className={`inline-flex h-button items-center justify-center rounded-md bg-primary-700 px-lg py-md text-body text-primary-100 hover:bg-primary-900 disabled:cursor-not-allowed disabled:bg-primary-100 disabled:text-text-secondary ${focusRingClasses}`}
      >
        {offline ? offlineLabel : copy.reset}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby="reset-confirm-heading"
        className="max-w-prose rounded-md border border-border bg-surface p-lg text-text-primary backdrop:bg-text-primary/40"
      >
        <h2 id="reset-confirm-heading" className="font-display text-h3">
          {copy.confirmHeading}
        </h2>
        <p className="mt-sm text-body text-text-secondary">
          {copy.confirmBody.replace('{name}', selected?.fullName ?? '')}
        </p>
        <div className="mt-lg flex flex-wrap justify-end gap-sm">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              dialog.current?.close();
            }}
          >
            {copy.cancel}
          </Button>
          <ConfirmButton label={copy.confirm} sendingLabel={copy.resetting} />
        </div>
      </dialog>
    </form>
  );
}
