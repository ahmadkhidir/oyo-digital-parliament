/**
 * Text input primitive — `branding.md`, Component Tokens → Inputs; `NFR-044`.
 *
 * Four declared states: default (`border`/`surface`/`text-primary`), focus (the `primary-500`
 * border plus the shared focus ring), error (`error-500` border, `aria-invalid`) and disabled
 * (`surface-secondary`/`text-secondary`). The invalid, disabled and association props are the
 * caller's to drive — validation rules and messages live above this package.
 *
 * The error message itself is `FieldError`; the caller wires this control's
 * `aria-describedby` to that element's `id` so the association is explicit and testable.
 */
import type { InputHTMLAttributes } from 'react';
import { focusRingClasses } from '../focus-ring';

const baseClasses =
  'h-input w-full rounded-md border bg-surface px-sm text-body text-text-primary placeholder:text-text-secondary';

const stateClasses = {
  default: 'border-border',
  invalid: 'border-error-500',
} as const;

const disabledClasses =
  'disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-secondary disabled:text-text-secondary';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** The value failed validation: the `error` component-token border plus `aria-invalid`. */
  invalid?: boolean;
}

export function TextInput({ invalid = false, className, ...rest }: TextInputProps) {
  return (
    <input
      type="text"
      className={[
        baseClasses,
        stateClasses[invalid ? 'invalid' : 'default'],
        focusRingClasses,
        disabledClasses,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
