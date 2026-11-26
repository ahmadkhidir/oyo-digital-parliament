/**
 * Ward Review Queue — `docs/OyoDigitalParliament/screens/19-ward-review-queue.md`, wired to `C-055`,
 * `C-056` and `C-057`.
 *
 * One route carries two work types. Descriptions reads the queue oldest first and shows one selected
 * description beside the candidate wards; resolving records the ward and moves the member and their
 * unresolved submissions, rejecting records the reason and leaves the member where they were.
 * Residences lists the members whose ward is recorded and whose residence is not yet accepted,
 * oldest registration first; acceptance is the only route from Registered to Checked and removes the
 * member from the list, while a refusal leaves them Registered and on it. A refusal states what is
 * missing: its reason is required while the reviewer has chosen to reject the residence (`C-057`),
 * and an acceptance needs none.
 *
 * The screen's rows carry the resident's own words or their display name and confirmed ward, never a
 * real name, a telephone number or a declared age. Residence rows are expanded in place rather than
 * selected by a member identifier in the URL: the identifier stays in the request body the form
 * posts, never in a query string.
 *
 * A refusal left by the action is stated on the page as well as held in the flow cookie, so a reviewer
 * who comes back to the queue is told why the last attempt changed nothing. The resolved notice carries
 * both its sentence and the moved count.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Notice, focusRingClasses } from '@odp/ui';
import { createWardResidenceReviewRepository } from '@odp/db';
import { GuardedSubmit, OfflineNote } from '../../../../(entry)/join/_shared/offline';
import { readWardReviewQueue, type WardCaller, type WardReviewWork } from '@odp/domain';
import { getMessages } from '../../../../../messages';
import { resolveLocale } from '../../../../../lib/i18n/locale';
import { newCorrelationId } from '../../../../../lib/logging';
import { getStaffAdminDependencies } from '../../../../../lib/staff-session/deps';
import { readWardReviewPorts } from '../../../../../lib/staff-session/deps';
import { readStaffAccess } from '../../../../../lib/staff-session/session';
import { readStaffFlow } from '../../../../../lib/staff-session/cookies';
import { recordResidenceReviewAction, resolveWardDescriptionAction } from './actions';
import { ResidenceDecisionFields } from './_residence-decision-fields';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).staff.wards.title };
}

interface WardReviewPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** The one-line outcome a successful action left behind. */
function noticeOf(
  flow: Awaited<ReturnType<typeof readStaffFlow>>,
  copy: ReturnType<typeof getMessages>['staff']['wards'],
): string | null {
  if (flow?.notice === 'WARD_RESOLVED') {
    const moved = copy.moved
      .replace('{moved}', String(flow.moved ?? 0))
      .replace('{unchanged}', String(flow.unchanged ?? 0));
    return `${copy.resolved} ${moved}`;
  }
  if (flow?.notice === 'WARD_REJECTED') return copy.rejected;
  if (flow?.notice === 'RESIDENCE_CHECKED') return copy.checked;
  if (flow?.notice === 'RESIDENCE_REJECTED') return copy.residenceRejected;
  return null;
}

/** The refusal sentence for one cause the action may leave behind. */
function failureOf(
  flow: Awaited<ReturnType<typeof readStaffFlow>>,
  copy: ReturnType<typeof getMessages>['staff']['wards'],
): string | null {
  switch (flow?.cause) {
    case 'WARD_RESOLUTION_INVALID':
      return copy.descriptionInvalid;
    case 'WARD_REVIEW_NOT_FOUND':
      return copy.reviewMissing;
    case 'WARD_DESCRIPTION_ALREADY_RESOLVED':
      return copy.alreadyResolved;
    case 'MEMBER_ACCOUNT_DELETED':
      return copy.memberDeleted;
    case 'WARD_NOT_FOUND':
      return copy.wardMissing;
    case 'MEMBER_NOT_FOUND':
      return copy.memberMissing;
    case 'RESIDENCE_REVIEW_INVALID':
      return copy.residenceInvalid;
    case 'WARD_UNRESOLVED':
      return copy.wardUnresolved;
    case 'WARD_REVIEWER_REQUIRED':
      return copy.reviewerRequired;
    case undefined:
      return null;
    default:
      return copy.actionFailed;
  }
}

/** Formats a `C-001` instant for the reviewer's locale. */
function formatDate(locale: string, instant: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(instant));
}

export default async function WardReviewPage({ searchParams }: WardReviewPageProps) {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in?ended=1');
  if (access.kind === 'challenge') redirect('/staff/2fa');

  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.staff.wards;
  const query = await searchParams;
  const work: WardReviewWork = query['work'] === 'residences' ? 'residences' : 'descriptions';
  const selectedId = typeof query['review'] === 'string' ? query['review'] : undefined;
  const area = typeof query['area'] === 'string' ? query['area'] : undefined;

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

  if (access.staff.role !== 'response_staff') {
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
  const reviewer: WardCaller = {
    kind: 'staff',
    staffId: access.staff.id,
    role: 'response_staff',
    correlationId: newCorrelationId(),
  };
  const ports = {
    ...readWardReviewPorts(dependencies.database),
    residenceReviews: createWardResidenceReviewRepository(dependencies.database.db),
  };
  const queue = await readWardReviewQueue(reviewer, ports, {
    work,
    status: 'queued',
    ...(area === undefined ? {} : { localGovernmentArea: area }),
    limit: 20,
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
          href="/admin/wards/review"
          className={`inline-flex min-h-button items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
        >
          {copy.retry}
        </a>
      </div>
    );
  }

  const count =
    queue.work === 'descriptions'
      ? copy.count.replace('{count}', String(queue.queuedCount))
      : copy.residencesCount.replace('{count}', String(queue.residenceCount));
  const selected =
    queue.work === 'descriptions'
      ? (queue.reviews.find((entry) => entry.review.id === selectedId) ?? queue.reviews[0] ?? null)
      : null;
  const member = selected?.member ?? null;
  const deleted = member === null || member.deleted;

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-wrap items-baseline justify-between gap-sm">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <p className="text-small text-text-secondary">{count}</p>
      </div>

      <nav aria-label={copy.workType}>
        <ul className="flex gap-md border-b border-border">
          <li>
            <a
              href="/admin/wards/review"
              aria-current={queue.work === 'descriptions' ? 'page' : undefined}
              className={`inline-flex min-h-button items-center px-sm text-body ${
                queue.work === 'descriptions'
                  ? 'border-b-2 border-primary-500 font-semibold text-text-primary'
                  : 'text-text-secondary'
              } ${focusRingClasses}`}
            >
              {copy.descriptionsTab}
            </a>
          </li>
          <li>
            <a
              href="/admin/wards/review?work=residences"
              aria-current={queue.work === 'residences' ? 'page' : undefined}
              className={`inline-flex min-h-button items-center px-sm text-body ${
                queue.work === 'residences'
                  ? 'border-b-2 border-primary-500 font-semibold text-text-primary'
                  : 'text-text-secondary'
              } ${focusRingClasses}`}
            >
              {copy.residencesTab}
            </a>
          </li>
        </ul>
      </nav>

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
      <OfflineNote message={copy.errorBody} />

      {queue.work === 'descriptions' ? (
        queue.reviews.length === 0 ? (
          <Notice role="status" tone="info" title={copy.empty}>
            {copy.emptyDates}
          </Notice>
        ) : (
          <div className="grid gap-xl desktop:grid-cols-5">
            <section aria-labelledby="queue-heading" className="desktop:col-span-2">
              <h2 id="queue-heading" className="text-h3 font-display text-text-primary">
                {copy.heading}
              </h2>
              <ul className="mt-sm flex flex-col divide-y divide-border border-y border-border">
                {queue.reviews.map((entry) => (
                  <li key={entry.review.id}>
                    <a
                      href={`/admin/wards/review?review=${entry.review.id}`}
                      aria-current={entry.review.id === selected?.review.id ? 'true' : undefined}
                      className={`flex flex-col gap-xs px-sm py-sm hover:bg-surface-muted ${focusRingClasses}`}
                    >
                      <span className="text-body text-text-primary">{entry.review.description}</span>
                      <span className="text-small text-text-secondary">
                        {entry.review.localGovernmentArea ?? '—'} ·{' '}
                        {formatDate(locale, entry.review.createdAt)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>

            {selected === null ? null : (
              <section aria-labelledby="case-heading" className="desktop:col-span-3">
                <h2 id="case-heading" className="text-h3 font-display text-text-primary">
                  {copy.descriptionHeading}
                </h2>
                <blockquote className="mt-sm border-s-2 border-primary-500 ps-md font-display text-body text-text-primary">
                  {selected.review.description}
                </blockquote>

                <dl className="mt-md grid grid-cols-2 gap-sm text-small">
                  <div>
                    <dt className="text-text-secondary">{copy.areaHeading}</dt>
                    <dd className="text-text-primary">
                      {selected.review.localGovernmentArea ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">{copy.identityLabel}</dt>
                    <dd className="text-text-primary">
                      {member === null ? '—' : copy.identity[member.identityState]}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-text-secondary">{copy.wardStatusLabel}</dt>
                    <dd className="text-text-primary">
                      {member === null ? '—' : copy.wardStatus[member.wardStatus]}
                    </dd>
                  </div>
                </dl>

                <h3 className="mt-lg text-body-strong text-text-primary">
                  {copy.submissionsHeading}
                </h3>
                {selected.submissionReferences.length === 0 ? (
                  <p className="text-small text-text-secondary">{copy.noSubmissions}</p>
                ) : (
                  <ul className="mt-xs flex flex-wrap gap-sm text-small text-text-primary">
                    {selected.submissionReferences.map((reference) => (
                      <li key={reference} className="rounded-sm border border-border px-sm py-xs">
                        {reference}
                      </li>
                    ))}
                  </ul>
                )}

                {deleted ? (
                  <Notice role="status" tone="warning">
                    {copy.deletedMember}
                  </Notice>
                ) : (
                  <form
                    action={resolveWardDescriptionAction}
                    className="mt-lg flex flex-col gap-sm"
                  >
                    <input type="hidden" name="reviewId" value={selected.review.id} />
                    <input type="hidden" name="decision" value="resolved" />
                    <label htmlFor="candidate-ward" className="text-small text-text-primary">
                      {copy.candidateWard}
                    </label>
                    <select
                      id="candidate-ward"
                      name="resolvedWardId"
                      required
                      className="min-h-button rounded-sm border border-border bg-surface px-sm text-body text-text-primary"
                    >
                      <option value="">{copy.chooseWard}</option>
                      {queue.candidateWards.map((ward) => (
                        <option key={ward.id} value={ward.id}>
                          {ward.name} — {ward.localGovernmentArea}
                        </option>
                      ))}
                    </select>
                    <GuardedSubmit
                      variant="primary"
                      className="w-full"
                      label={copy.resolve}
                      sendingLabel={copy.resolving}
                      offlineLabel={copy.errorBody}
                    />
                  </form>
                )}

                <form action={resolveWardDescriptionAction} className="mt-lg flex flex-col gap-sm">
                  <input type="hidden" name="reviewId" value={selected.review.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <label htmlFor="rejection-reason" className="text-small text-text-primary">
                    {copy.rejectReason}
                  </label>
                  <textarea
                    id="rejection-reason"
                    name="rejectionReason"
                    required
                    maxLength={500}
                    rows={3}
                    className="rounded-sm border border-border bg-surface px-sm py-xs text-body text-text-primary"
                  />
                  <GuardedSubmit
                    variant="outline"
                    className="w-full"
                    label={copy.reject}
                    sendingLabel={copy.rejecting}
                    offlineLabel={copy.errorBody}
                  />
                </form>
              </section>
            )}
          </div>
        )
      ) : queue.residences.length === 0 ? (
        <Notice role="status" tone="info" title={copy.residencesEmpty}>
          {copy.residencesEmptyDates}
        </Notice>
      ) : (
        <section aria-labelledby="residences-heading">
          <h2 id="residences-heading" className="text-h3 font-display text-text-primary">
            {copy.residenceListHeading}
          </h2>
          <ul className="mt-sm flex flex-col divide-y divide-border border-y border-border">
            {queue.residences.map((residence) => (
              <li key={residence.memberId}>
                <details>
                  <summary
                    className={`flex cursor-pointer flex-col gap-xs px-sm py-sm hover:bg-surface-muted ${focusRingClasses}`}
                  >
                    <span className="text-body text-text-primary">{residence.displayName}</span>
                    <span className="text-small text-text-secondary">
                      {residence.wardName} · {formatDate(locale, residence.registeredAt)}
                    </span>
                  </summary>

                  <div className="flex flex-col gap-sm px-sm pb-md">
                    <dl className="grid grid-cols-2 gap-sm text-small">
                      <div>
                        <dt className="text-text-secondary">{copy.confirmedWard}</dt>
                        <dd className="text-text-primary">{residence.wardName}</dd>
                      </div>
                      <div>
                        <dt className="text-text-secondary">{copy.registeredAt}</dt>
                        <dd className="text-text-primary">
                          {formatDate(locale, residence.registeredAt)}
                        </dd>
                      </div>
                    </dl>

                    <form
                      action={recordResidenceReviewAction}
                      className="flex flex-col gap-sm border-t border-border pt-lg"
                    >
                      <h3 className="text-body-strong text-text-primary">
                        {copy.residenceHeading}
                      </h3>
                      <input type="hidden" name="memberId" value={residence.memberId} />
                      <label
                        htmlFor={`residence-method-${residence.memberId}`}
                        className="text-small text-text-primary"
                      >
                        {copy.method}
                      </label>
                      <select
                        id={`residence-method-${residence.memberId}`}
                        name="method"
                        required
                        className="min-h-button rounded-sm border border-border bg-surface px-sm text-body text-text-primary"
                      >
                        <option value="ward_confirmation">{copy.methods.ward_confirmation}</option>
                        <option value="organiser_attestation">
                          {copy.methods.organiser_attestation}
                        </option>
                        <option value="document">{copy.methods.document}</option>
                      </select>
                      <ResidenceDecisionFields memberId={residence.memberId} copy={copy} />
                      <GuardedSubmit
                        variant="outline"
                        className="w-full"
                        label={copy.recordResidence}
                        sendingLabel={copy.recordingResidence}
                        offlineLabel={copy.errorBody}
                      />
                    </form>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
