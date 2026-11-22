/**
 * The brand mark binding for the entry screens (`assets/ASSETS.md` A-001/A-003; `branding.md`,
 * Brand Mark & Logo System).
 *
 * The mark is the ledger's own drawing, never redrawn or recoloured here: the master ink form
 * (A-001) sits on the warm paper surface, and the knockout form (A-003) is the reversal the
 * branding declares for the dark column. Both files are served from `/brand/`; the stylesheet
 * picks the one in force for the active token family, so one binding holds in both themes.
 *
 * The mark is decorative beside the product name - the name is the link and the accessible
 * text - so the image carries an empty alternative and is hidden from the accessibility tree.
 */
import type { ReactNode } from 'react';

export interface BrandMarkProps {
  /** The box the mark fills; a spacing token class such as `size-button` or `size-2xl`. */
  className?: string;
}

export function BrandMark({ className = 'size-icon' }: BrandMarkProps): ReactNode {
  return (
    <span aria-hidden="true" className={['inline-flex shrink-0', className].join(' ')}>
      <img src="/brand/mark.svg" alt="" className="brand-mark-ink size-full" />
      <img src="/brand/mark-knockout.svg" alt="" className="brand-mark-knockout size-full" />
    </span>
  );
}
