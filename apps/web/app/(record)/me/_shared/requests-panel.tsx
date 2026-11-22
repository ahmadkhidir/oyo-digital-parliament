/**
 * The member's data requests, the export download and the deletion flow
 * (`C-035`, `C-036`, `screens/13-my-record.md`).
 *
 * Every request the member has made is listed with its status, the date it was asked and — while
 * it is open — the date it is due. A completed export offers the short-lived download; a request
 * deferred for a legal hold states the reason and the date the hold is reviewed. The export and
 * deletion controls are native disclosures, so each works with scripting disabled, and the two
 * forms post their type to the one `C-035` action.
 */
import { randomUUID } from 'node:crypto';
import type { ReactNode } from 'react';
import { Button, focusRingClasses } from '@odp/ui';
import { dataRequestDueAt, type MyRecord } from '@odp/domain';
import { interpolate } from '../../../../lib/i18n/format';
import type { LaunchLocale, Messages } from '../../../../messages';
import { formatRecordDate } from '../_lib/dates';
import { requestStatusWord, requestTypeWord } from '../_lib/forms';

export interface RequestsPanelProps {
  readonly copy: Messages['myRecord']['requests'];
  readonly locale: LaunchLocale;
  readonly requests: readonly MyRecord['dataRequests'][number][];
  /** The single `C-035` action the export and deletion forms post to. */
  readonly action: (formData: FormData) => Promise<void>;
  readonly exportCopy: Messages['myRecord']['exportAction'];
  readonly deleteCopy: Messages['myRecord']['deleteAction'];
}

/** Whether a request is still being worked. */
function isOpen(status: string): boolean {
  return status === 'received' || status === 'in_progress';
}

/** The export or deletion controls, alone. */
export interface RightsActionFormsProps {
  readonly copy: Messages['myRecord'];
  readonly action: (formData: FormData) => Promise<void>;
}

/**
 * The two rights controls as disclosures.
 *
 * Used on a complete record and again in the error state, where the record could not be read but
 * the member's right to ask for an export or a deletion must remain available.
 */
export function RightsActionForms({ copy, action }: RightsActionFormsProps): ReactNode {
  return (
    <div className="flex flex-col gap-sm">
      <details className="rounded-md border border-border">
        <summary
          className={`flex min-h-button cursor-pointer items-center px-md py-sm text-body-strong text-text-primary ${focusRingClasses}`}
        >
          {copy.exportAction.summary}
        </summary>
        <div className="flex flex-col gap-sm border-t border-border px-md py-md">
          <p className="max-w-prose text-body text-text-secondary">{copy.exportAction.body}</p>
          <form action={action}>
            <input type="hidden" name="type" value="export" />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <Button type="submit" variant="primary">
              {copy.exportAction.submit}
            </Button>
          </form>
        </div>
      </details>

      <details className="rounded-md border border-border">
        <summary
          className={`flex min-h-button cursor-pointer items-center px-md py-sm text-body-strong text-text-primary ${focusRingClasses}`}
        >
          {copy.deleteAction.summary}
        </summary>
        <div className="flex flex-col gap-sm border-t border-border px-md py-md">
          <p className="max-w-prose text-body text-text-secondary">{copy.deleteAction.body}</p>
          <form action={action}>
            <input type="hidden" name="type" value="deletion" />
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <Button type="submit" variant="destructive">
              {copy.deleteAction.submit}
            </Button>
          </form>
        </div>
      </details>
    </div>
  );
}

export function RequestsPanel({
  copy,
  locale,
  requests,
  action,
  exportCopy,
  deleteCopy,
}: RequestsPanelProps): ReactNode {
  const completedExport = requests.find(
    (request) =>
      request.type === 'export' &&
      request.status === 'completed' &&
      request.fileReference !== undefined,
  );
  const openExport = requests.some(
    (request) => request.type === 'export' && isOpen(request.status),
  );
  const openDeletion = requests.some(
    (request) =>
      request.type === 'deletion' &&
      (isOpen(request.status) || request.status === 'deferred_for_legal_hold'),
  );

  return (
    <section aria-labelledby="requests-heading" className="flex flex-col gap-md">
      <h2 id="requests-heading" className="text-h2 text-text-primary">
        {copy.heading}
      </h2>

      {requests.length === 0 ? (
        <p className="max-w-prose text-body text-text-secondary">{copy.empty}</p>
      ) : (
        <ul className="flex flex-col">
          {requests.map((request) => {
            const due =
              isOpen(request.status) || request.status === 'deferred_for_legal_hold'
                ? dataRequestDueAt(request.type, request.requestedAt)
                : null;
            return (
              <li
                key={request.id}
                className="flex flex-col gap-xs border-b border-border py-md last:border-b-0"
              >
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <span className="text-body-strong text-text-primary">
                    {requestTypeWord(copy, request.type)}
                  </span>
                  <span className="text-small text-text-secondary">
                    {requestStatusWord(copy, request.status)}
                  </span>
                </div>
                <p className="text-small text-text-secondary">
                  {interpolate(copy.requestedOn, {
                    date: formatRecordDate(locale, request.requestedAt),
                  })}
                  {due === null
                    ? null
                    : ` \u2014 ${interpolate(copy.dueBy, { date: formatRecordDate(locale, due) })}`}
                </p>

                {request.status === 'deferred_for_legal_hold' ? (
                  <div className="flex flex-col gap-xs rounded-sm border border-warning-300 bg-warning-100 px-sm py-sm">
                    <p className="text-body-strong text-warning-900">{copy.legalHoldHeading}</p>
                    <p className="text-small text-warning-900">{copy.legalHoldBody}</p>
                    {request.legalHoldNote === null ? null : (
                      <p className="text-small text-warning-900">
                        {copy.legalHoldReason}: {request.legalHoldNote}
                      </p>
                    )}
                    {request.legalHoldReviewAt === null ? null : (
                      <p className="text-small text-warning-900">
                        {interpolate(copy.legalHoldReview, {
                          date: formatRecordDate(locale, request.legalHoldReviewAt),
                        })}
                      </p>
                    )}
                  </div>
                ) : null}

                {request.type === 'export' &&
                request.status === 'completed' &&
                request.fileReference !== undefined ? (
                  <div className="flex flex-col gap-xs">
                    <a
                      href={`/api/me/data-requests/${request.id}/file`}
                      className={`inline-flex min-h-button w-fit items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
                    >
                      {copy.download}
                    </a>
                    <p className="text-small text-text-secondary">{copy.downloadNote}</p>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* The export controls: a ready file, a request already open, or the request itself. */}
      {completedExport === undefined && !openExport ? (
        <details className="rounded-md border border-border">
          <summary
            className={`flex min-h-button cursor-pointer items-center px-md py-sm text-body-strong text-text-primary ${focusRingClasses}`}
          >
            {exportCopy.summary}
          </summary>
          <div className="flex flex-col gap-sm border-t border-border px-md py-md">
            <p className="max-w-prose text-body text-text-secondary">{exportCopy.body}</p>
            <form action={action}>
              <input type="hidden" name="type" value="export" />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <Button type="submit" variant="primary">
                {exportCopy.submit}
              </Button>
            </form>
          </div>
        </details>
      ) : openExport ? (
        <p className="text-body text-text-secondary">{exportCopy.open}</p>
      ) : null}

      {/* The deletion controls, unless a deletion is already being worked or held. */}
      {openDeletion ? (
        <div className="flex flex-col gap-xs rounded-sm border border-border px-md py-sm">
          <p className="text-body-strong text-text-primary">{deleteCopy.openHeading}</p>
          <p className="text-small text-text-secondary">{deleteCopy.openBody}</p>
        </div>
      ) : (
        <details className="rounded-md border border-border">
          <summary
            className={`flex min-h-button cursor-pointer items-center px-md py-sm text-body-strong text-text-primary ${focusRingClasses}`}
          >
            {deleteCopy.summary}
          </summary>
          <div className="flex flex-col gap-sm border-t border-border px-md py-md">
            <p className="max-w-prose text-body text-text-secondary">{deleteCopy.body}</p>
            <form action={action}>
              <input type="hidden" name="type" value="deletion" />
              <input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <Button type="submit" variant="destructive">
                {deleteCopy.submit}
              </Button>
            </form>
          </div>
        </details>
      )}
    </section>
  );
}
