/**
 * My Record — `docs/OyoDigitalParliament/screens/13-my-record.md`, wired to `C-032` (the read),
 * `C-033` (correction and language), `C-034` (consent) and `C-035` (data requests). The export
 * download itself is `C-036`, rendered here as the short-lived link the contract issues.
 *
 * The screen states resolve on the server wherever a datum decides them:
 *
 * - **Signed out** — a sign-in prompt rather than an empty record. The proxy sends a visitor with
 *   no cookie to sign-in; a cookie whose session has ended renders this state in place.
 * - **Loading** — `loading.tsx`, the fetch-level skeleton for the profile and the submission list.
 * - **Error** — the record could not be read. A retry is offered and the export and deletion forms
 *   stay available, because the right to ask is not suspended by a failed read.
 * - **No submissions yet / Populated** — the empty explanation with a route to raise something, or
 *   the member's submissions with their decisions.
 * - **Unresolved ward** — the account names the ward as unresolved and links to confirmation.
 * - **Request pending / Export ready / Delete deferred for legal hold** — `_shared/requests-panel`.
 * - **Consent states** — `_shared/consent-panel`, one toggle per optional purpose.
 *
 * Every interface string resolves from the catalogue; dates go through the Lagos calendar. No
 * personal value enters the URL: a refused correction leaves only a reason token and the opaque
 * digest that names its server-side echo.
 */
import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { readMyRecord } from '@odp/domain';
import { Button, Notice, focusRingClasses } from '@odp/ui';
import { newCorrelationId } from '../../../lib/logging';
import { resolveLocale } from '../../../lib/i18n/locale';
import { getMessages, type LaunchLocale, type Messages } from '../../../messages';
import { signOutAction } from '../../../lib/session/actions';
import { presentedMemberSessionToken } from '../../../lib/session/session-cookies';
import { getMyRecordRuntime, readWardName, resolveMyRecordSession } from './_lib/runtime';
import { readRecordEcho, recordEchoKey } from './_lib/echo';
import { noticeForOutcome } from './_lib/outcome';
import { formatRecordDate } from './_lib/dates';
import { AccountPanel } from './_shared/account-panel';
import { ConsentPanel } from './_shared/consent-panel';
import { BackingsPanel, HeldItemsPanel, SubmissionsPanel } from './_shared/submissions-panel';
import { RequestsPanel, RightsActionForms } from './_shared/requests-panel';
import { correctMyDetailsAction, createDataRequestAction, updateConsentAction } from './actions';

/** The digest an echo key is written as: SHA-256, hex. */
const ECHO_DIGEST = /^[0-9a-f]{64}$/;

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await resolveLocale()).myRecord.title };
}

interface MyRecordPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

/** Reads one query value as a single string, or `null`. */
function queryValue(
  query: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | null {
  const raw = query[name];
  return typeof raw === 'string' ? raw : null;
}

/** The page frame both the prompt and the record render inside. */
function PageFrame({
  copy,
  children,
}: {
  readonly copy: Messages['myRecord'];
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-xl px-lg py-xl">
      <header className="flex flex-col gap-sm border-b border-border pb-md">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <p className="max-w-prose text-body text-text-secondary">{copy.intro}</p>
      </header>
      {children}
      <footer className="flex flex-wrap items-center justify-between gap-md border-t border-border pt-md">
        <a
          href="/privacy"
          className={`inline-flex min-h-button items-center text-small text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
        >
          {copy.privacyLink}
        </a>
        <form action={signOutAction}>
          <Button type="submit" variant="ghost">
            {copy.signOut}
          </Button>
        </form>
      </footer>
    </div>
  );
}

/** The signed-out state: a prompt with the door, never an empty record (`screens/13`). */
function SignedOut({ copy }: { readonly copy: Messages['myRecord'] }) {
  return (
    <div className="flex flex-col gap-md">
      <h2 className="text-h2 text-text-primary">{copy.signedOutHeading}</h2>
      <p className="max-w-prose text-body text-text-secondary">{copy.signedOutBody}</p>
      <a
        href="/sign-in?returnTo=%2Fme"
        className={`inline-flex min-h-button w-fit items-center rounded-md bg-primary-700 px-lg py-md text-body text-primary-100 ${focusRingClasses}`}
      >
        {copy.signedOutAction}
      </a>
    </div>
  );
}

/** The error state: a retry and the rights controls, never a blank page. */
function RecordError({ copy }: { readonly copy: Messages['myRecord'] }) {
  return (
    <div className="flex flex-col gap-lg">
      <Notice
        tone="error"
        role="alert"
        title={copy.errorHeading}
        action={
          <a
            href="/me"
            className={`inline-flex min-h-button items-center underline underline-offset-2 ${focusRingClasses}`}
          >
            {copy.retry}
          </a>
        }
      >
        {copy.errorBody}
      </Notice>
      <RightsActionForms copy={copy} action={createDataRequestAction} />
    </div>
  );
}

export default async function MyRecordPage({ searchParams }: MyRecordPageProps) {
  const token = await presentedMemberSessionToken();
  const session = await resolveMyRecordSession(token);

  // A member's own locale is authoritative once signed in (`C-001` Locale); a visitor reading the
  // prompt still follows the browser's choice.
  const locale: LaunchLocale =
    session.kind === 'member' ? session.member.locale : await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.myRecord;
  const query = await searchParams;

  if (session.kind === 'signed-out') {
    return (
      <PageFrame copy={copy}>
        <SignedOut copy={copy} />
      </PageFrame>
    );
  }

  if (session.kind === 'degraded') {
    return (
      <PageFrame copy={copy}>
        <RecordError copy={copy} />
      </PageFrame>
    );
  }

  const runtime = await getMyRecordRuntime();
  const result = await readMyRecord(
    {
      kind: 'member',
      memberId: session.member.id,
      sessionId: session.token,
      correlationId: newCorrelationId(),
    },
    runtime.ports,
    { submissionLimit: 20 },
  );

  if (!result.ok) {
    // A member whose account has gone sees the sign-in prompt, not a technical refusal.
    if (result.code === 'UNAUTHENTICATED' || result.code === 'NOT_FOUND') {
      return (
        <PageFrame copy={copy}>
          <SignedOut copy={copy} />
        </PageFrame>
      );
    }
    return (
      <PageFrame copy={copy}>
        <RecordError copy={copy} />
      </PageFrame>
    );
  }

  const record = result.record;
  const wardName = await readWardName(record.member.wardId);
  const status = queryValue(query, 'st');
  const error = queryValue(query, 'e');
  // The one variable a notice interpolates: the date a detected legal hold is reviewed. A query
  // value outside the `C-001` instant form is dropped rather than rendered.
  const rawReview = queryValue(query, 'd');
  const review =
    rawReview !== null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(rawReview)
      ? formatRecordDate(locale, rawReview)
      : undefined;
  const notice = noticeForOutcome(
    copy,
    status,
    error,
    review === undefined ? {} : { date: review },
  );

  const rawDigest = queryValue(query, 'k');
  const echo =
    rawDigest !== null && ECHO_DIGEST.test(rawDigest)
      ? await readRecordEcho(runtime.platform.cache, recordEchoKey(rawDigest))
      : null;

  return (
    <PageFrame copy={copy}>
      {notice === null ? null : (
        <Notice
          tone={notice.tone}
          role={notice.role}
          {...(notice.title === undefined ? {} : { title: notice.title })}
        >
          {notice.message}
        </Notice>
      )}

      <AccountPanel
        copy={copy}
        locale={locale}
        member={record.member}
        wardName={wardName}
        echo={echo}
        echoKey={randomUUID()}
        action={correctMyDetailsAction}
        languages={messages.footer.languages}
        consentCount={record.consents.length}
        submissionCount={record.submissions.length}
        backingCount={record.heldBackings.length}
        requestCount={record.dataRequests.length}
        heldItemCount={record.heldItems.length}
      />

      <SubmissionsPanel copy={copy} submissions={record.submissions} />
      <HeldItemsPanel copy={copy} heldItems={record.heldItems} />
      <BackingsPanel copy={copy} backings={record.heldBackings} />
      <ConsentPanel
        copy={copy.consent}
        locale={locale}
        consents={record.consents}
        action={updateConsentAction}
      />
      <RequestsPanel
        copy={copy.requests}
        locale={locale}
        requests={record.dataRequests}
        action={createDataRequestAction}
        exportCopy={copy.exportAction}
        deleteCopy={copy.deleteAction}
      />
    </PageFrame>
  );
}
