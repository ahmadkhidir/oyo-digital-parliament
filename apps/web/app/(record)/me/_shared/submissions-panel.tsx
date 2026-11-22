/**
 * The member's submissions, their decisions, the proposals they backed and the items a legal
 * review has withheld (`C-032`, `screens/13-my-record.md`).
 *
 * This is the loop the screen exists to close: every submission the member wrote, its status in
 * the member's own words, and the campaign's answer as a word plus a marker — never a colour
 * alone (`NFR-044`). The list is server-rendered; nothing here needs scripting.
 */
import type { ReactNode } from 'react';
import { StatusLabel, focusRingClasses } from '@odp/ui';
import type { MyRecord } from '@odp/domain';
import { interpolate } from '../../../../lib/i18n/format';
import type { Messages } from '../../../../messages';
import {
  backingStateWord,
  decisionStatusKey,
  decisionWord,
  submissionStatusWord,
} from '../_lib/forms';

const rowLinkClasses = `text-body-strong text-primary-700 underline underline-offset-2 hover:text-primary-900 ${focusRingClasses}`;

export interface SubmissionsPanelProps {
  readonly copy: Messages['myRecord'];
  readonly submissions: readonly MyRecord['submissions'][number][];
}

export function SubmissionsPanel({ copy, submissions }: SubmissionsPanelProps): ReactNode {
  return (
    <section aria-labelledby="submissions-heading" className="flex flex-col gap-md">
      <h2 id="submissions-heading" className="text-h2 text-text-primary">
        {copy.submissions.heading}
      </h2>

      {submissions.length === 0 ? (
        <div className="flex flex-col gap-sm rounded-md border border-border p-md">
          <h3 className="text-h3 text-text-primary">{copy.submissions.emptyHeading}</h3>
          <p className="max-w-prose text-body text-text-secondary">{copy.submissions.emptyBody}</p>
          <a
            href="/submit"
            className={`inline-flex min-h-button w-fit items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
          >
            {copy.submissions.emptyAction}
          </a>
        </div>
      ) : (
        <ul className="flex flex-col">
          {submissions.map((submission) => {
            const decision =
              submission.decision === null ? null : decisionWord(copy, submission.decision.type);
            return (
              <li
                key={submission.reference}
                className="flex flex-col gap-sm border-b border-border py-md last:border-b-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <a href={`/s/${submission.reference}`} className={rowLinkClasses}>
                    {interpolate(copy.submissions.open, {
                      reference: submission.reference,
                    })}
                  </a>
                  <span className="text-small text-text-secondary">
                    {submissionStatusWord(copy, submission.status)}
                  </span>
                </div>
                {submission.decision === null || decision === null ? null : (
                  <div>
                    <StatusLabel
                      statusKey={decisionStatusKey(submission.decision.type)}
                      word={decision}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export interface HeldItemsPanelProps {
  readonly copy: Messages['myRecord'];
  readonly heldItems: readonly MyRecord['heldItems'][number][];
}

/** The member's own items a legal review is holding, with the reviewer's published note. */
export function HeldItemsPanel({ copy, heldItems }: HeldItemsPanelProps): ReactNode {
  if (heldItems.length === 0) return null;
  return (
    <section aria-labelledby="held-items-heading" className="flex flex-col gap-sm">
      <h2 id="held-items-heading" className="text-h2 text-text-primary">
        {copy.heldItems.heading}
      </h2>
      <p className="max-w-prose text-body text-text-secondary">{copy.heldItems.body}</p>
      <ul className="flex flex-col">
        {heldItems.map((item) => (
          <li
            key={item.reference}
            className="flex flex-col gap-xs border-b border-border py-sm last:border-b-0"
          >
            <span className="text-body-strong text-text-primary">{item.reference}</span>
            <span className="text-small text-text-secondary">{item.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface BackingsPanelProps {
  readonly copy: Messages['myRecord'];
  readonly backings: readonly MyRecord['heldBackings'][number][];
}

/** The proposals this member backed, with the proposal's status and the backing's own state. */
export function BackingsPanel({ copy, backings }: BackingsPanelProps): ReactNode {
  return (
    <section aria-labelledby="backings-heading" className="flex flex-col gap-sm">
      <h2 id="backings-heading" className="text-h2 text-text-primary">
        {copy.backings.heading}
      </h2>
      {backings.length === 0 ? (
        <p className="max-w-prose text-body text-text-secondary">{copy.backings.empty}</p>
      ) : (
        <ul className="flex flex-col">
          {backings.map((backing) => (
            <li
              key={backing.submissionReference}
              className="flex flex-wrap items-center justify-between gap-sm border-b border-border py-sm last:border-b-0"
            >
              <a href={`/s/${backing.submissionReference}`} className={rowLinkClasses}>
                {backing.submissionReference}
              </a>
              <span className="text-small text-text-secondary">
                {submissionStatusWord(copy, backing.submissionStatus)} {'\u2014'}{' '}
                {backingStateWord(copy, backing.backingState)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
