/**
 * One labelled field of an entry-flow form, and the summary that names every failing field
 * (`screens/03` Validation Error state, `screens/02` and `screens/04` field failures; `NFR-044`:
 * every input has a label, every error is associated with its control and announced, and the
 * failing fields are named - never one page apology).
 *
 * The field wears the register's margin number when the screen numbers its entries: a decorative
 * ordinal in the left gutter, hidden from the accessibility tree, so the label still leads the
 * control it belongs to. A screen with one field passes no number and the gutter goes away.
 *
 * The copy arrives already translated and formatted; this module renders it and associates it.
 * The hint and the error share the control's `aria-describedby`: the hint when the field is
 * intact, the error when it is not, so a screen reader never reads a stale sentence under an
 * invalid control.
 */
import type { InputHTMLAttributes, ReactNode } from 'react';
import { FieldError, FieldLabel, Notice, TextInput } from '@odp/ui';

export interface FlowFieldProps {
  /** The control's `id`; the label, the hint and the error all bind through it. */
  id: string;
  /** The field's decorative margin number, when the screen numbers its entries. */
  index?: string;
  /** The visible label; a caller may compose a marker into it. */
  label: ReactNode;
  /** The hint sentence, shown under the label. */
  hint: string;
  /** The translated failure sentence, present only when the field failed. */
  error?: string | undefined;
  /** The attributes the control needs: name, type, defaults and the browser's own constraints. */
  input: InputHTMLAttributes<HTMLInputElement>;
}

export function FlowField({ id, index, label, hint, error, input }: FlowFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="flex gap-sm tablet:gap-md">
      {index === undefined ? null : (
        <span
          aria-hidden="true"
          className="w-xl shrink-0 pt-xs font-display text-small tabular-nums text-text-secondary"
        >
          {index}
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-xs">
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
 * The summary above the fields.
 *
 * It is an assertive live region so its appearance is announced, and each entry is an anchor to
 * its field, so the reader can reach the control with scripting disabled. The anchor keeps the
 * error tone's own text colour, which is the contrast-checked pair for that tint.
 */
export function ErrorSummary({ heading, items }: ErrorSummaryProps): ReactNode {
  if (items.length === 0) return null;
  return (
    <Notice role="alert" tone="error" title={heading}>
      <ul className="flex list-disc flex-col gap-xs ps-lg">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className="text-small underline underline-offset-2 hover:no-underline"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </Notice>
  );
}
