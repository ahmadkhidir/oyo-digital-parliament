/**
 * One labelled field of a join-flow form, and the error summary that names every failing field
 * (`screens/03` Validation Error state; `NFR-044`: every input has a label, every error is
 * associated with its control and announced, and the failing fields are named — never one page
 * apology).
 *
 * The copy arrives already translated and formatted; this module renders it and associates it.
 * The hint and the error share the control's `aria-describedby`: the hint when the field is
 * intact, the error when it is not, so a screen reader never reads a stale sentence under an
 * invalid control.
 */
import type { InputHTMLAttributes, ReactNode } from 'react';import { FieldError, FieldLabel, TextInput } from '@odp/ui';

export interface FlowFieldProps {
  /** The control's `id`; the label, the hint and the error all bind through it. */
  id: string;
  /** The visible label; a caller may compose a marker into it. */
  label: ReactNode;
  /** The hint sentence, shown under the label. */
  hint: string;
  /** The translated failure sentence, present only when the field failed. */
  error?: string | undefined;
  /** The attributes the control needs: name, type, defaults and the browser's own constraints. */
  input: InputHTMLAttributes<HTMLInputElement>;
}

export function FlowField({ id, label, hint, error, input }: FlowFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-xs">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <p id={hintId} className="text-small text-text-secondary">
        {hint}
      </p>
      <TextInput
        id={id}
        {...input}
        invalid={error !== undefined}
        aria-describedby={error === undefined ? hintId : errorId}
      />
      {error === undefined ? null : <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

export interface ErrorSummaryProps {
  /** The summary's heading, already translated. */
  heading: string;
  /** One entry per failing field: the anchor target and the field's own name as the reader sees it. */
  items: readonly { readonly href: string; readonly label: string }[];
}

/**
 * The error summary above the fields.
 *
 * It is a live region (`role="alert"`) so its appearance is announced, and each entry is an anchor
 * to its field, so the reader can reach the control with scripting disabled.
 */
export function ErrorSummary({ heading, items }: ErrorSummaryProps): ReactNode {
  if (items.length === 0) return null;
  return (
    <div role="alert" className="border border-border bg-surface px-md py-sm">
      <p className="text-body-strong text-text-primary">{heading}</p>
      <ul className="mt-xs flex list-disc flex-col gap-xs ps-lg">
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="text-small text-primary-500 underline underline-offset-2">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
