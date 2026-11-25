/**
 * The privacy notice body (`screens/23-privacy-notice.md`, `C-037`, `NFR-040`, `NFR-045`).
 *
 * The notice has to be readable before registration, so it is a server-rendered document with no
 * session and no client JavaScript: what is public, why each purpose is held, the rights and how to
 * use them, how long each data class is kept, the processor and the processing region, and the
 * published contact. The "Updated" state adds the change date and links to the version it replaced;
 * an unknown version renders the error state with the contact route rather than a blank page.
 *
 * Exported as a component as well as rendered by the route so the two-version state is exercised
 * against a fixture without changing the launch notice.
 */
import type { ReactNode } from 'react';
import { focusRingClasses } from '@odp/ui';
import { interpolate } from '../../../../lib/i18n/format';
import type { LaunchLocale, Messages } from '../../../../messages';
import { formatNoticeDate, selectNotice, type NoticeHistory } from '../_lib/notice';

export interface PrivacyNoticeScreenProps {
  readonly copy: Messages['privacy'];
  readonly locale: LaunchLocale;
  readonly history: NoticeHistory;
  /** A version named in the query, or `null` for the current notice. */
  readonly requestedVersion: string | null;
}

/** One accordion section of the notice. */
function NoticeSection({
  heading,
  id,
  children,
}: {
  readonly heading: string;
  readonly id: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <details id={id} className="rounded-md border border-border">
      <summary
        className={`flex min-h-button cursor-pointer items-center px-md py-sm text-h3 text-text-primary ${focusRingClasses}`}
      >
        {heading}
      </summary>
      <div className="border-t border-border px-md py-md text-body text-text-primary">
        {children}
      </div>
    </details>
  );
}

/** The contact block, repeated by the error state so a failure always has a route. */
function ContactBlock({ copy }: { readonly copy: Messages['privacy'] }): ReactNode {
  return (
    <section id="contact" aria-labelledby="contact-heading" className="flex flex-col gap-sm">
      <h2 id="contact-heading" className="text-h2 text-text-primary">
        {copy.contactHeading}
      </h2>
      <p className="max-w-prose text-body text-text-secondary">{copy.contactBody}</p>
      <a
        href="/contact"
        className={`inline-flex min-h-button w-fit items-center text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
      >
        {copy.contactLink}
      </a>
    </section>
  );
}

export function PrivacyNoticeScreen({
  copy,
  locale,
  history,
  requestedVersion,
}: PrivacyNoticeScreenProps): ReactNode {
  const selection = selectNotice(history, requestedVersion);

  if (selection === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-xl px-lg py-xl">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <div
          role="alert"
          className="flex flex-col gap-sm rounded-md border border-error-300 bg-error-100 p-md"
        >
          <p className="text-body-strong text-error-900">{copy.errorHeading}</p>
          <p className="text-body text-error-900">{copy.errorBody}</p>
          <p className="text-small text-error-900">{copy.unknownVersion}</p>
        </div>
        <ContactBlock copy={copy} />
        <a
          href="/"
          className={`inline-flex min-h-button w-fit items-center text-small text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
        >
          {copy.backToRecord}
        </a>
      </div>
    );
  }

  const notice = selection.notice;
  const updated = selection.current && history.previous.length > 0;
  const changeDate = formatNoticeDate(locale, notice.effectiveAt);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-xl px-lg py-xl">
      <header className="flex flex-col gap-sm border-b border-border pb-md">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <p className="text-small text-text-secondary">
          {interpolate(copy.effective, { date: changeDate })}
        </p>
        {updated ? (
          <p className="text-small text-text-secondary">
            {interpolate(copy.updatedNote, { date: changeDate })}
          </p>
        ) : null}
        {selection.current ? null : (
          <p className="text-small text-text-secondary">
            {interpolate(copy.viewingPrevious, {
              date: changeDate,
              effectiveDate: formatNoticeDate(locale, history.current.effectiveAt),
            })}{' '}
            <a
              href="/privacy"
              className={`inline-flex min-h-button items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
            >
              {copy.currentLink}
            </a>
          </p>
        )}
      </header>

      <section aria-labelledby="summary-heading" className="flex flex-col gap-sm">
        <h2 id="summary-heading" className="text-h2 text-text-primary">
          {copy.summaryHeading}
        </h2>
        <p className="max-w-prose text-body text-text-primary">{notice.summary}</p>
      </section>

      <NoticeSection heading={copy.lawfulHeading} id="lawful-basis">
        <ul className="flex list-disc flex-col gap-xs ps-lg">
          {notice.lawfulBasis.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </NoticeSection>

      <NoticeSection heading={copy.rightsHeading} id="rights">
        <ul className="flex list-disc flex-col gap-xs ps-lg">
          {notice.rights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </NoticeSection>

      <NoticeSection heading={copy.retentionHeading} id="retention">
        <ul className="flex list-disc flex-col gap-xs ps-lg">
          {notice.retention.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </NoticeSection>

      <NoticeSection heading={copy.processorsHeading} id="processors">
        <ul className="flex flex-col gap-md">
          {notice.processors.map((processor) => (
            <li key={processor.name} className="flex flex-col gap-xs">
              <p className="text-body-strong text-text-primary">{processor.name}</p>
              <p className="text-body text-text-primary">{processor.purpose}</p>
              <p className="text-small text-text-secondary">{processor.region}</p>
            </li>
          ))}
        </ul>
      </NoticeSection>

      {history.previous.length === 0 ? null : (
        <nav aria-label={copy.previousHeading} className="flex flex-col gap-xs">
          <p className="text-body-strong text-text-primary">{copy.previousHeading}</p>
          <ul className="flex flex-wrap gap-x-lg">
            {history.previous.map((previous) => (
              <li key={previous.version}>
                <a
                  href={`/privacy?version=${encodeURIComponent(previous.version)}`}
                  className={`inline-flex min-h-button items-center text-small text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
                >
                  {interpolate(copy.previousLink, {
                    date: formatNoticeDate(locale, previous.effectiveAt),
                  })}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <ContactBlock copy={copy} />

      <a
        href="/"
        className={`inline-flex min-h-button w-fit items-center text-small text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
      >
        {copy.backToRecord}
      </a>
    </div>
  );
}
