/**
 * Data Request Queue — `docs/OyoDigitalParliament/screens/22-data-request-queue.md`, wired to `C-066`
 * and `C-067`.
 *
 * The queue is ordered by statutory deadline. The detail panel shows the type, state, due date, legal
 * hold and review date, outcome reason and file reference — never a resident's name or number. The
 * operator works the request through the identity service; this screen only moves its state.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Notice, focusRingClasses } from '@odp/ui';
import { GuardedSubmit, OfflineNote } from '../../../(entry)/join/_shared/offline';
import { readDataRequestQueue, type IdentityCaller } from '@odp/domain';
import { getMessages } from '../../../../messages';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import { readStaffAccess, staffCaller } from '../../../../lib/staff-session/session';
import { readStaffFlow } from '../../../../lib/staff-session/cookies';
import { resolveDataRequestAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).staff.dataRequests.title };
}

interface DataRequestsPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The one-line outcome a successful action left behind. */
function noticeOf(
  flow: Awaited<ReturnType<typeof readStaffFlow>>,
  copy: ReturnType<typeof getMessages>['staff']['dataRequests'],
): string | null {
  switch (flow?.notice) {
    case 'REQUEST_STARTED':
      return copy.startedNotice;
    case 'REQUEST_COMPLETED':
      return copy.completedNotice;
    case 'REQUEST_DEFERRED':
      return copy.deferredNotice;
    case 'REQUEST_REFUSED':
      return copy.refusedNotice;
    case 'DELETION_COMPLETED':
      return copy.deletedNotice;
    default:
      return null;
  }
}

/** The failure sentence for one cause the action may leave behind. */
function failureOf(
  flow: Awaited<ReturnType<typeof readStaffFlow>>,
  copy: ReturnType<typeof getMessages>['staff']['dataRequests'],
): string | null {
  switch (flow?.cause) {
    case 'LEGAL_HOLD':
      return copy.holdBlocked;
    case 'DATA_REQUEST_ALREADY_CLOSED':
      return copy.alreadyClosed;
    case 'DATA_REQUEST_RESOLUTION_INVALID':
      return copy.refusedReason;
    case undefined:
      return null;
    default:
      return copy.error;
  }
}

export default async function DataRequestsPage({ searchParams }: DataRequestsPageProps) {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in?ended=1');
  if (access.kind === 'challenge') redirect('/staff/2fa');

  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.staff.dataRequests;
  const query = await searchParams;
  const selectedId = typeof query['request'] === 'string' ? query['request'] : undefined;

  if (access.kind === 'degraded') {
    return (
      <div className="flex flex-col gap-md">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <Notice role="alert" tone="error">
          {copy.errorBody}
        </Notice>
      </div>
    );
  }

  if (access.staff.role !== 'operator') {
    return (
      <div className="flex flex-col gap-md">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <Notice role="status" tone="info">
          {copy.noPermission}
        </Notice>
      </div>
    );
  }

  const dependencies = await getStaffAdminDependencies();
  const caller: IdentityCaller = staffCaller(access, locale);
  const queue = await readDataRequestQueue(caller, {
    dataRequests: dependencies.dataRequests,
    clock: dependencies.identity.clock,
  });
  const flow = await readStaffFlow();
  const notice = noticeOf(flow, copy);
  const failure = failureOf(flow, copy);

  if (!queue.ok) {
    return (
      <div className="flex flex-col gap-md">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <Notice role="alert" tone="error">
          {copy.errorBody}
        </Notice>
        <a
          href="/admin/data-requests"
          className={`inline-flex min-h-button items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
        >
          {copy.retry}
        </a>
      </div>
    );
  }

  const selected =
    queue.requests.find((request) => request.id === selectedId) ?? queue.requests[0] ?? null;
  const closed =
    selected !== null &&
    (selected.status === 'completed' || selected.status === 'refused');
  const date = (value: string): string =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(value));

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <p className="text-small text-text-secondary">
          {copy.counts
            .replace('{open}', String(queue.openCount))
            .replace('{overdue}', String(queue.overdueCount))}
        </p>
      </div>

      <Notice role="status" tone="info">
        {copy.personalDataNotice}
      </Notice>
      {notice === null ? null : (
        <Notice role="status" tone="success">
          {notice}
        </Notice>
      )}
      {failure === null ? null : (
        <Notice role="alert" tone="error">
          {failure}
        </Notice>
      )}
      <OfflineNote message={copy.error} />

      {queue.requests.length === 0 ? (
        <Notice role="status" tone="info" title={copy.empty}>
          {copy.emptyDates}
        </Notice>
      ) : (
        <div className="grid gap-xl desktop:grid-cols-5">
          <section aria-labelledby="request-list-heading" className="desktop:col-span-2">
            <h2 id="request-list-heading" className="text-h3 font-display text-text-primary">
              {copy.heading}
            </h2>
            <ul className="mt-sm flex flex-col divide-y divide-border border-y border-border">
              {queue.requests.map((request) => (
                <li key={request.id}>
                  <a
                    href={`/admin/data-requests?request=${request.id}`}
                    aria-current={request.id === selected?.id ? 'true' : undefined}
                    className={`flex flex-col gap-xs px-sm py-sm hover:bg-surface-muted ${focusRingClasses}`}
                  >
                    <span className="flex flex-wrap items-baseline gap-sm">
                      <span className="text-body text-text-primary">{copy.types[request.type]}</span>
                      <span className="text-small text-text-secondary">
                        {copy.statuses[request.status]}
                      </span>
                      {request.overdue ? (
                        <span className="rounded-sm border border-error-500 px-xs text-caption text-error-700">
                          {copy.overdue}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-small text-text-secondary">
                      {copy.dueAt}: {date(request.dueAt)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          {selected === null ? null : (
            <section aria-labelledby="detail-heading" className="desktop:col-span-3">
              <h2 id="detail-heading" className="text-h3 font-display text-text-primary">
                {copy.detailHeading}
              </h2>
              <dl className="mt-sm grid grid-cols-2 gap-sm text-small">
                <div>
                  <dt className="text-text-secondary">{copy.typeLabel}</dt>
                  <dd className="text-text-primary">{copy.types[selected.type]}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{copy.statusLabel}</dt>
                  <dd className="text-text-primary">{copy.statuses[selected.status]}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{copy.requestedAt}</dt>
                  <dd className="text-text-primary">{date(selected.requestedAt)}</dd>
                </div>
                <div>
                  <dt className="text-text-secondary">{copy.dueAt}</dt>
                  <dd className="text-text-primary">{date(selected.dueAt)}</dd>
                </div>
                {selected.legalHoldNote === null ? null : (
                  <div className="col-span-2">
                    <dt className="text-text-secondary">{copy.holdNote}</dt>
                    <dd className="text-text-primary">{selected.legalHoldNote}</dd>
                  </div>
                )}
                {selected.legalHoldReviewAt === null ? null : (
                  <div>
                    <dt className="text-text-secondary">{copy.holdReviewAt}</dt>
                    <dd className="text-text-primary">{date(selected.legalHoldReviewAt)}</dd>
                  </div>
                )}
                {selected.outcomeReason === null ? null : (
                  <div className="col-span-2">
                    <dt className="text-text-secondary">{copy.outcomeReason}</dt>
                    <dd className="text-text-primary">{selected.outcomeReason}</dd>
                  </div>
                )}
                {selected.fileReference === null ? null : (
                  <div className="col-span-2">
                    <dt className="text-text-secondary">{copy.fileReference}</dt>
                    <dd className="break-all text-text-primary">{selected.fileReference}</dd>
                  </div>
                )}
              </dl>

              {closed ? null : (
                <div className="mt-lg flex flex-col gap-lg">
                  {selected.type === 'export' ? (
                    <p className="text-small text-text-secondary">{copy.exportNote}</p>
                  ) : null}

                  <form action={resolveDataRequestAction} className="flex flex-wrap gap-sm">
                    <input type="hidden" name="requestId" value={selected.id} />
                    <input type="hidden" name="action" value="start" />
                    <GuardedSubmit
                      variant="outline"
                      className="w-full tablet:w-auto"
                      label={copy.start}
                      sendingLabel={copy.starting}
                      offlineLabel={copy.error}
                    />
                  </form>

                  <form action={resolveDataRequestAction} className="flex flex-wrap gap-sm">
                    <input type="hidden" name="requestId" value={selected.id} />
                    <input type="hidden" name="action" value="complete" />
                    <GuardedSubmit
                      variant="primary"
                      className="w-full tablet:w-auto"
                      label={copy.complete}
                      sendingLabel={copy.completing}
                      offlineLabel={copy.error}
                    />
                  </form>

                  <form
                    action={resolveDataRequestAction}
                    className="flex flex-col gap-sm border-t border-border pt-lg"
                  >
                    <input type="hidden" name="requestId" value={selected.id} />
                    <input type="hidden" name="action" value="defer" />
                    <label htmlFor="outcome-reason" className="text-small text-text-primary">
                      {copy.outcomeReasonField}
                    </label>
                    <textarea
                      id="outcome-reason"
                      name="outcomeReason"
                      rows={2}
                      maxLength={1000}
                      required
                      className="rounded-sm border border-border bg-surface px-sm py-xs text-body text-text-primary"
                    />
                    <label htmlFor="hold-note" className="text-small text-text-primary">
                      {copy.holdNoteField}
                    </label>
                    <input
                      id="hold-note"
                      name="legalHoldNote"
                      type="text"
                      maxLength={500}
                      required
                      className="min-h-button rounded-sm border border-border bg-surface px-sm text-body text-text-primary"
                    />
                    <label htmlFor="hold-review-at" className="text-small text-text-primary">
                      {copy.reviewDateField}
                    </label>
                    <input
                      id="hold-review-at"
                      name="legalHoldReviewAt"
                      type="datetime-local"
                      required
                      className="min-h-button rounded-sm border border-border bg-surface px-sm text-body text-text-primary"
                    />
                    <GuardedSubmit
                      variant="outline"
                      className="w-full tablet:w-auto"
                      label={copy.defer}
                      sendingLabel={copy.deferring}
                      offlineLabel={copy.error}
                    />
                  </form>

                  <form
                    action={resolveDataRequestAction}
                    className="flex flex-col gap-sm border-t border-border pt-lg"
                  >
                    <input type="hidden" name="requestId" value={selected.id} />
                    <input type="hidden" name="action" value="refuse" />
                    <label htmlFor="refusal-reason" className="text-small text-text-primary">
                      {copy.outcomeReasonField}
                    </label>
                    <textarea
                      id="refusal-reason"
                      name="outcomeReason"
                      rows={2}
                      maxLength={1000}
                      required
                      className="rounded-sm border border-border bg-surface px-sm py-xs text-body text-text-primary"
                    />
                    <GuardedSubmit
                      variant="outline"
                      className="w-full tablet:w-auto"
                      label={copy.refuse}
                      sendingLabel={copy.refusing}
                      offlineLabel={copy.error}
                    />
                  </form>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
