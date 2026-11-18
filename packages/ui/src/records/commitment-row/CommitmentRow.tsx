/**
 * Commitment Row — `docs/OyoDigitalParliament/screens.md`, Shared / Common Components.
 *
 * One commitment line, rendered as a list item the caller places inside a `<ul>`; the whole
 * row opens the submission it came from. The row states, in order: the commitment's reference
 * and pillar (the title), who owns it with its cost band and due date (the detail), the
 * author-withdrawn flag when there is one, and the commitment's current status as a
 * `StatusLabel` — word, then shape, then colour (`branding.md`, Status labels).
 *
 * The detail, the flag and the status word are the caller's already-resolved slot props; the
 * component composes no sentence and truncates nothing.
 */
import type { ReactNode } from 'react';
import { focusRingClasses } from '../../primitives/focus-ring';
import { StatusLabel, type StatusLabelProps } from '../status-label/StatusLabel';

export interface CommitmentRowProps {
  /** The submission the commitment came from. */
  href: string;
  /** The commitment's reference — data, not copy, rendered at emphasis. */
  reference: string;
  /** The pillar's name, translated. */
  pillarLabel: string;
  /** Who owns it, its cost band and when it is due — composed by the caller. */
  detail: ReactNode;
  /** Shows when the author withdrew the submission behind the commitment; absent otherwise. */
  flag?: ReactNode | null;
  /** The commitment's current state: the register's status key plus the caller's translated word. */
  status: StatusLabelProps;
}

export function CommitmentRow({
  href,
  reference,
  pillarLabel,
  detail,
  flag,
  status,
}: CommitmentRowProps) {
  return (
    <li>
      <a
        href={href}
        className={`flex min-h-button flex-col gap-xs rounded-md border border-border bg-surface px-md py-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface hover:bg-primary-100 ${focusRingClasses}`}
      >
        {/* Title and status on one line; both may wrap on Yoruba-length text. */}
        <span className="flex flex-wrap items-baseline justify-between gap-sm">
          <span className="text-body-strong text-text-primary">
            <span className="whitespace-nowrap">{reference}</span> <span>{pillarLabel}</span>
          </span>
          <StatusLabel statusKey={status.statusKey} word={status.word} />
        </span>
        <span className="text-small text-text-secondary">{detail}</span>
        {flag ? <span className="text-small text-text-secondary">{flag}</span> : null}
      </a>
    </li>
  );
}
