/**
 * Contact — `docs/OyoDigitalParliament/screens/27-contact.md`; `operations.md` Resident.
 *
 * One published route to ask a question or to exercise a right. The page is static: the only
 * deployment value it reads is the published external form's address, and the campaign's
 * first-response time is stated from `operations.md`.
 *
 * The screen file declares two states, and both resolve here:
 *
 * - **Default** — the published form, its first-response time, the caution and the rights routes.
 * - **Error** — no form is configured for this deployment. The page states the fallback mailbox
 *   and the rights route instead of rendering a link that goes nowhere.
 *
 * The page collects nothing: there is no field on it, so a resident's words, telephone number or
 * ward description cannot be captured by this application. A member session is resolved only to
 * decide whether the My Record rights route is offered; a signed-out visitor is told where the
 * rights live and is never sent to a sign-in wall from a link that named My Record.
 */
import type { Metadata } from 'next';
import { resolveLocale } from '../../../lib/i18n/locale';
import { getMessages } from '../../../messages';
import { presentedMemberSessionToken } from '../../../lib/session/session-cookies';
import { resolveMyRecordSession } from '../me/_lib/runtime';
import { privacyMailboxHref, readContactChannel } from './_lib/channel';
import { ContactScreen } from './_shared/contact-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await resolveLocale()).contact.title };
}

export default async function ContactPage() {
  const token = await presentedMemberSessionToken();
  const session = await resolveMyRecordSession(token);
  const locale = session.kind === 'member' ? session.member.locale : await resolveLocale();

  return (
    <ContactScreen
      copy={getMessages(locale).contact}
      channel={readContactChannel()}
      signedIn={session.kind === 'member'}
      mailboxHref={privacyMailboxHref()}
    />
  );
}
