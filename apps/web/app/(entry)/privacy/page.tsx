/**
 * Privacy Notice — `docs/OyoDigitalParliament/screens/23-privacy-notice.md`, wired to `C-037`.
 *
 * Public by design: the notice is readable before registration, so the page resolves no session.
 * It renders the published version, or the version named in `?version=` when a member follows the
 * "previous version" link from the Updated state. An unknown version is the screen's error state,
 * with the published contact route and never a blank page.
 *
 * The entry group's layout supplies the minimal masthead and the footer this screen declares.
 */
import type { Metadata } from 'next';
import { getMessages } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { launchNoticeHistory } from './_lib/notice';
import { PrivacyNoticeScreen } from './_shared/notice-screen';

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await resolveLocale()).privacy.title };
}

interface PrivacyPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function PrivacyPage({ searchParams }: PrivacyPageProps) {
  const locale = await resolveLocale();
  const copy = getMessages(locale).privacy;
  const query = await searchParams;
  const rawVersion = query['version'];
  const requestedVersion = typeof rawVersion === 'string' ? rawVersion : null;

  return (
    <PrivacyNoticeScreen
      copy={copy}
      locale={locale}
      history={launchNoticeHistory(locale)}
      requestedVersion={requestedVersion}
    />
  );
}
