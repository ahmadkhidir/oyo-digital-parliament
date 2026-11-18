/**
 * Field label primitive — the first half of labelled-field composition (`NFR-044`).
 *
 * A label that binds to its control through the caller-supplied `htmlFor`; the label's copy,
 * including any required or optional marker, arrives as children from the message catalogue.
 * Field composition (hints, character counts, the inline error summary) is the `src/forms/`
 * layer; this is the primitive every composition binds with.
 */
import type { LabelHTMLAttributes } from 'react';

export type FieldLabelProps = LabelHTMLAttributes<HTMLLabelElement>;

export function FieldLabel({ className, htmlFor, ...rest }: FieldLabelProps) {
  return (
    // The association is the caller's `htmlFor`, restated as an explicit attribute so the
    // jsx-a11y label check can see it; the binding itself is asserted in the tests.
    <label
      htmlFor={htmlFor}
      className={['text-body text-text-primary', className].filter(Boolean).join(' ')}
      {...rest}
    />
  );
}
