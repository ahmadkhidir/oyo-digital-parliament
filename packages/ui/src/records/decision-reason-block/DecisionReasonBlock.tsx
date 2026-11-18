/**
 * Decision Reason Block — `docs/OyoDigitalParliament/screens.md`, Shared / Common Components.
 *
 * The decision, its signatory, its date and its reason, in one group. The reason renders in
 * full, never collapsed and never truncated — a refusal is printed at the same weight as a
 * commitment (`branding.md`, Design Character). A superseded decision renders below a rule
 * with the caller's superseded word, so the record shows the earlier decision marked, not
 * removed.
 *
 * Every word arrives as a prop; the component composes no sentence.
 */
import type { ReactNode } from 'react';

export interface DecisionReasonBlockProps {
  /** The decision in one line, translated. */
  decision: string;
  /** Who signed it and when — composed by the caller. */
  signatory: string;
  /** The reason in full. Multi-paragraph reasons arrive as caller-supplied markup. */
  reason: ReactNode;
  /** The catalogue's word marking a superseded decision; present only on a revision. */
  supersededWord?: string | null;
  /** The earlier decision, superseded, kept in the record. */
  supersededDecision?: ReactNode | null;
}

export function DecisionReasonBlock({
  decision,
  signatory,
  reason,
  supersededWord,
  supersededDecision,
}: DecisionReasonBlockProps) {
  return (
    <section className="rounded-md border border-border bg-surface p-md shadow-sm">
      <h3 className="font-display text-h3 text-text-primary">{decision}</h3>
      <p className="mt-xs text-small text-text-secondary">{signatory}</p>
      {/* The reason in full: no disclosure, no line clamp, no truncation. */}
      <div className="mt-sm text-body text-text-primary">{reason}</div>
      {supersededWord && supersededDecision ? (
        <p className="mt-md border-t border-border pt-sm text-small text-text-secondary">
          <span className="text-caption">{supersededWord}</span> <span>{supersededDecision}</span>
        </p>
      ) : null}
    </section>
  );
}
