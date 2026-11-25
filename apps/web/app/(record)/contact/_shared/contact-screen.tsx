/**
 * The Contact screen (`screens/27-contact.md`; `operations.md` Resident).
 *
 * One published route to ask a question or to exercise a right, so the page leads with the channel
 * and the rights rather than with prose. Two states, as the screen file declares them:
 *
 * - **Default** — the published form with the campaign's first-response time, the caution about
 *   what not to send, the rights routes, and the campaign disclosure.
 * - **Error** — no form is configured, so the page states the fallback mailbox and the rights
 *   route. It is never a blank page and never a link that goes nowhere.
 *
 * The page collects nothing: there is no field on it, so no submission text, telephone number or
 * ward description can be captured here. The external form is an address the caller resolved; this
 * component renders it and authors none of its words.
 *
 * Every link is a plain anchor, so the page reads and navigates with scripting disabled; the
 * external channel carries its new-tab warning as text rather than as a colour or an icon.
 */
import type { ReactNode } from 'react';
import { Notice, focusRingClasses } from '@odp/ui';
import type { Messages } from '../../../../messages';
import type { ContactChannel } from '../_lib/channel';

/** The page frame both states render inside. */
function PageFrame({
  copy,
  children,
}: {
  readonly copy: Messages['contact'];
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-xl px-lg py-xl">
      <header className="flex flex-col gap-sm border-b border-border pb-md">
        <h1 className="font-display text-display text-text-primary">{copy.heading}</h1>
        <p className="max-w-prose text-body text-text-secondary">{copy.intro}</p>
      </header>
      {children}
      <p className="max-w-prose border-t border-border pt-md text-small text-text-secondary">
        {copy.disclosure}
      </p>
      <a
        href="/"
        className={`inline-flex min-h-button w-fit items-center text-small text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
      >
        {copy.backToRecord}
      </a>
    </div>
  );
}

/** The rights routes: the notice for everyone, My Record only for a signed-in member. */
function RightsRoutes({
  copy,
  signedIn,
}: {
  readonly copy: Messages['contact'];
  readonly signedIn: boolean;
}): ReactNode {
  return (
    <section aria-labelledby="contact-rights-heading" className="flex flex-col gap-md">
      <h2 id="contact-rights-heading" className="text-h2 text-text-primary">
        {copy.rightsHeading}
      </h2>
      <ul className="flex flex-col gap-md">
        <li className="flex flex-col gap-xs">
          <a
            href="/privacy"
            className={`inline-flex min-h-button w-fit items-center text-body text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
          >
            {copy.privacyRights}
          </a>
          <p className="max-w-prose text-small text-text-secondary">{copy.privacyRightsNote}</p>
        </li>
        {signedIn ? (
          <li className="flex flex-col gap-xs">
            <a
              href="/me"
              className={`inline-flex min-h-button w-fit items-center text-body text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
            >
              {copy.myRecordRights}
            </a>
            <p className="max-w-prose text-small text-text-secondary">{copy.myRecordRightsNote}</p>
          </li>
        ) : (
          // A signed-out visitor is told where the rights live rather than sent to a sign-in wall
          // from a link that named My Record (`screens/27-contact.md`, Edge Cases).
          <li>
            <p className="max-w-prose text-small text-text-secondary">{copy.signedOutRightsNote}</p>
          </li>
        )}
      </ul>
    </section>
  );
}

export interface ContactScreenProps {
  readonly copy: Messages['contact'];
  /** The published channel: the external form, or the statement that none is configured. */
  readonly channel: ContactChannel;
  /** Whether a member session is open, which decides whether My Record is offered. */
  readonly signedIn: boolean;
  /** The published privacy mailbox, already resolved to its `mailto:` address. */
  readonly mailboxHref: string;
}

export function ContactScreen({
  copy,
  channel,
  signedIn,
  mailboxHref,
}: ContactScreenProps): ReactNode {
  if (channel.kind === 'unavailable') {
    return (
      <PageFrame copy={copy}>
        <div className="flex flex-col gap-md">
          <Notice tone="error" role="alert" title={copy.errorHeading}>
            {copy.errorBody}
          </Notice>
          <a
            href={mailboxHref}
            className={`inline-flex min-h-button w-fit items-center text-body text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
          >
            {copy.mailboxLabel}
          </a>
        </div>
        <RightsRoutes copy={copy} signedIn={signedIn} />
      </PageFrame>
    );
  }

  return (
    <PageFrame copy={copy}>
      <section
        aria-labelledby="contact-channel-heading"
        className="flex flex-col gap-sm rounded-md border border-border p-md"
      >
        <h2 id="contact-channel-heading" className="text-h2 text-text-primary">
          {copy.channelHeading}
        </h2>
        <p className="max-w-prose text-body text-text-secondary">{copy.channelBody}</p>
        <a
          href={channel.formUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex min-h-button w-fit items-center rounded-md bg-primary-700 px-lg py-md text-body text-primary-100 ${focusRingClasses}`}
        >
          {copy.channelLabel}
        </a>
        {/* The new page is announced in words, not marked by an icon or a tint (`NFR-044`). */}
        <p className="text-small text-text-secondary">{copy.channelNewTab}</p>
        <p className="text-body-strong text-text-primary">{copy.responseTime}</p>
      </section>

      <section aria-labelledby="contact-caution-heading" className="flex flex-col gap-sm">
        <h2 id="contact-caution-heading" className="text-h2 text-text-primary">
          {copy.cautionHeading}
        </h2>
        <p className="max-w-prose text-body text-text-secondary">{copy.caution}</p>
      </section>

      <RightsRoutes copy={copy} signedIn={signedIn} />
    </PageFrame>
  );
}
