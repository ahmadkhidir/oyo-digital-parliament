/**
 * One labelled field of a My Record form (`NFR-044`, `screens/13-my-record.md`).
 *
 * The pattern is the entry flow's: the label binds to the control, the hint and the error share the
 * control's `aria-describedby`, and a failing field carries its own sentence under it rather than a
 * page-level apology. The copy arrives already translated; this module renders it and associates
 * it. It stays local to the member surface while that is the only route using it.
 */
import type { InputHTMLAttributes, ReactNode } from 'react';
import { FieldError, FieldLabel, TextInput } from '@odp/ui';

export interface RecordFieldProps {
  /** The control's `id`; the label, the hint and the error all bind through it. */
  id: string;
  /** The visible label, already translated. */
  label: ReactNode;
  /** The hint sentence, already translated. */
  hint: string;
  /** The translated failure sentence, present only when the field failed. */
  error?: string | undefined;
  /** The attributes the control needs: name, type, defaults and browser constraints. */
  input: InputHTMLAttributes<HTMLInputElement>;
}

export function RecordField({ id, label, hint, error, input }: RecordFieldProps): ReactNode {
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
