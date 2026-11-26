'use client';

/**
 * The residence decision and its reason (`screens/19-ward-review-queue.md`, `C-057`).
 *
 * This is the only client boundary on the Residences work type, and it exists for one state a server
 * render cannot carry on its own: the refusal reason is required exactly while the reviewer has
 * chosen to reject the residence. The reason is the same field as an acceptance's note, so a value
 * typed before the decision changed stays in the field rather than being cleared or remounted.
 *
 * With scripting disabled the markup still posts as a plain form to the same action: nothing is
 * marked required, the server refuses a rejection that states no reason, and the queue states that
 * refusal in words. The requirement is always stated in the hint as text, never by colour or by an
 * `aria-required` alone.
 *
 * All copy arrives already translated; this component reads no session, store or network.
 */
import { useState } from 'react';

/** The decision a reviewer can record. */
type ResidenceDecision = 'checked' | 'rejected';

export interface ResidenceDecisionCopy {
  readonly decision: string;
  readonly accept: string;
  readonly refuse: string;
  readonly notes: string;
  readonly notesHint: string;
  readonly refusalReason: string;
  readonly refusalReasonHint: string;
}

export interface ResidenceDecisionFieldsProps {
  /** The member whose residence is being reviewed; it names the field ids so rows stay distinct. */
  readonly memberId: string;
  readonly copy: ResidenceDecisionCopy;
}

export function ResidenceDecisionFields({ memberId, copy }: ResidenceDecisionFieldsProps) {
  const [decision, setDecision] = useState<ResidenceDecision | null>(null);
  const refusing = decision === 'rejected';
  const notesId = `residence-notes-${memberId}`;
  const hintId = `${notesId}-hint`;

  return (
    <>
      <fieldset className="flex flex-col gap-xs border-0 p-0">
        <legend className="text-small text-text-primary">{copy.decision}</legend>
        <label className="flex items-center gap-xs text-small text-text-primary">
          <input
            type="radio"
            name="decision"
            value="checked"
            required
            checked={decision === 'checked'}
            onChange={() => setDecision('checked')}
          />
          {copy.accept}
        </label>
        <label className="flex items-center gap-xs text-small text-text-primary">
          <input
            type="radio"
            name="decision"
            value="rejected"
            checked={refusing}
            onChange={() => setDecision('rejected')}
          />
          {copy.refuse}
        </label>
      </fieldset>

      <label htmlFor={notesId} className="text-small text-text-primary">
        {refusing ? copy.refusalReason : copy.notes}
      </label>
      <p id={hintId} className="text-small text-text-secondary">
        {refusing ? copy.refusalReasonHint : copy.notesHint}
      </p>
      <textarea
        id={notesId}
        name="notes"
        rows={2}
        maxLength={1000}
        required={refusing}
        aria-describedby={hintId}
        className="rounded-sm border border-border bg-surface px-sm py-xs text-body text-text-primary"
      />
    </>
  );
}
