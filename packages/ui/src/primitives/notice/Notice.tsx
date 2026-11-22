/**
 * Notice primitive - an outcome stated on the page (`screens.md` alert and inline-message
 * components; `NFR-044`: the reason is text, never a tint).
 *
 * The screen files ask for an alert on more than one surface: the publication statement before
 * the registration fields, a refused code, a failed dispatch, a rate limit, an ended session and
 * the offline banner. They share one presentation and three facts the caller owns:
 *
 * - **Tone** names what kind of news it is, and only supplies the tint. The sentence inside is
 *   always the reason, so the notice still reads in greyscale.
 * - **Role** decides how it is announced: `alert` for a refusal that changed the screen, `status`
 *   for an outcome the reader should hear without losing their place, and no role for a notice
 *   that is present on arrival.
 * - **Title** is optional; a two-line outcome (a heading and its explanation) passes both, and a
 *   field-level sentence stays under its control instead (`FieldError`).
 *
 * The component authors no copy, formats nothing and decides no state. Every string, including
 * the action's label, arrives already translated from the caller.
 */
import type { ReactNode } from 'react';

/** The tone families the branding palette declares; each maps to its own tint and text pair. */
export type NoticeTone = 'neutral' | 'accent' | 'info' | 'warning' | 'error' | 'success';

/**
 * Literal class names, one row per tone. The pairs are the branding's own tint/text pairs, so a
 * notice is contrast-checked by the same table as the status labels and needs no local colour.
 */
const toneClasses: Record<NoticeTone, string> = {
  neutral: 'border-border bg-surface text-text-primary',
  accent: 'border-primary-300 bg-primary-100 text-primary-900',
  info: 'border-info-300 bg-info-100 text-info-900',
  warning: 'border-warning-300 bg-warning-100 text-warning-900',
  error: 'border-error-300 bg-error-100 text-error-900',
  success: 'border-success-300 bg-success-100 text-success-900',
};

export interface NoticeProps {
  /** What kind of news this is; supplies the tint only. */
  tone?: NoticeTone;
  /** How a screen reader hears it: a refusal, an outcome, or a notice present on arrival. */
  role?: 'alert' | 'status';
  /** An optional strong first line, already translated. */
  title?: ReactNode;
  /** The reason or the explanation, already translated. */
  children: ReactNode;
  /** The recovery the notice offers, when it has one: a link or a button, already translated. */
  action?: ReactNode;
  className?: string;
}

export function Notice({
  tone = 'neutral',
  role,
  title,
  children,
  action,
  className,
}: NoticeProps) {
  return (
    <div
      {...(role === undefined ? {} : { role })}
      className={['flex flex-col gap-xs rounded-md border p-md', toneClasses[tone], className]
        .filter(Boolean)
        .join(' ')}
    >
      {title === undefined ? null : <p className="text-body-strong">{title}</p>}
      <div className="text-body">{children}</div>
      {action === undefined ? null : <div className="mt-xs">{action}</div>}
    </div>
  );
}
