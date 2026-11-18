/**
 * Status marker geometry — `assets/ASSETS.md`, Family: Status marker; `branding.md`,
 * Component Tokens → Status labels ("a word first, a shape second, and colour third").
 *
 * The ten markers are built from five primitives on a 16-unit artboard with the shape in a
 * 10-unit box: square, circle, equilateral triangle, diamond, bar. Outline forms carry a
 * 2-unit stroke with mitred joins and no rounding; filled forms are solid to the same extents,
 * so swapping one status for another never shifts the label. The path data is the same
 * geometry the A-030…A-039 slot files are authored from; the presentation resolves the tone to
 * the label's own text colour through `currentColor`, and the marker never stands alone —
 * `StatusLabel` renders the word before it and hides it from the accessibility tree.
 *
 * The one deliberate deviation: the outlined dot (A-030) is drawn at a 6-unit diameter. The
 * ledger's settings put every shape in a 10-unit box, which would make the dot identical to
 * the outlined circle (A-037) and break the ledger's own greyscale separation check; the
 * conflict is reported to the coordinator as a specification gap rather than resolved in the
 * ledger.
 */
import { statusLabels, type StatusKey } from '../../tokens/source';

function StatusMarker({ shape }: { shape: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" className="size-icon shrink-0">
      {(() => {
        switch (shape) {
          case 'outline-dot':
            return <circle cx={8} cy={8} r={3} fill="none" stroke="currentColor" strokeWidth={2} />;
          case 'outline-triangle':
            return (
              <path
                d="M8 4 L13 13 L3 13 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinejoin="miter"
              />
            );
          case 'filled-circle':
            return <circle cx={8} cy={8} r={5} fill="currentColor" />;
          case 'filled-diamond':
            return <path d="M8 3 L13 8 L8 13 L3 8 Z" fill="currentColor" />;
          case 'filled-square':
            return <rect x={3} y={3} width={10} height={10} fill="currentColor" />;
          case 'filled-triangle':
            return <path d="M8 4 L13 13 L3 13 Z" fill="currentColor" />;
          case 'filled-bar':
            return <rect x={3} y={6.5} width={10} height={3} fill="currentColor" />;
          case 'outline-circle':
            return <circle cx={8} cy={8} r={5} fill="none" stroke="currentColor" strokeWidth={2} />;
          case 'outline-bar':
            return (
              <rect
                x={3}
                y={6.5}
                width={10}
                height={3}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              />
            );
          case 'outline-square':
            return (
              <rect
                x={3}
                y={3}
                width={10}
                height={10}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              />
            );
          default:
            // The variant unions are exhaustive in the token source; an unknown shape fails
            // the typecheck there before it can reach this switch.
            return null;
        }
      })()}
    </svg>
  );
}

export interface StatusLabelProps {
  /** The register's status key; it selects the marker shape and the tone from the branding mapping. */
  statusKey: StatusKey;
  /** The status word, already translated by the caller. The component never chooses the text. */
  word: string;
  className?: string;
}

/**
 * Literal class names, one row of the status-label table each. Built as a static map — not
 * derived from the token source at runtime — so Tailwind's scanner sees every name and each
 * generated custom property is included in the shipped CSS.
 */
const statusClasses: Record<StatusKey, string> = {
  'awaiting-decision': 'bg-neutral-100 text-neutral-900',
  overdue: 'bg-warning-100 text-warning-900',
  committed: 'bg-info-100 text-info-900',
  referred: 'bg-info-100 text-info-900',
  delivered: 'bg-success-100 text-success-900',
  slipped: 'bg-warning-100 text-warning-900',
  dropped: 'bg-error-100 text-error-900',
  declined: 'bg-neutral-100 text-neutral-900',
  withdrawn: 'bg-neutral-100 text-neutral-700',
  withheld: 'bg-error-100 text-error-900',
};

/**
 * The status label: word, then shape, then colour. Rendered as inline content sized against
 * `caption` type; the marker rides the label's own text colour, so both token families hold.
 */
export function StatusLabel({ statusKey, word, className }: StatusLabelProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-xs rounded-sm px-sm py-xs text-caption',
        statusClasses[statusKey],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="whitespace-nowrap">{word}</span>
      <StatusMarker shape={statusLabels[statusKey].marker.shape} />
    </span>
  );
}
