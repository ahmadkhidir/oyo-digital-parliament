/**
 * Field error primitive — the error state's text half (`NFR-044`, WCAG 3.3.1/3.3.3).
 *
 * The sentence is the reason, never a tint: the caller's translated message rendered at the
 * `error-500` validation-failure token and announced through `role="alert"`. The caller passes
 * the `id` and wires it into the control's `aria-describedby`; the association stays explicit.
 */
import type { ReactNode } from 'react';

export interface FieldErrorProps {
  /** The `id` the caller binds into the control's `aria-describedby`. */
  id: string;
  /** The caller's translated error sentence; the component renders no copy of its own. */
  children: ReactNode;
  className?: string;
}

export function FieldError({ id, children, className }: FieldErrorProps) {
  return (
    <p
      id={id}
      role="alert"
      className={['text-small text-error-500', className].filter(Boolean).join(' ')}
    >
      {children}
    </p>
  );
}
