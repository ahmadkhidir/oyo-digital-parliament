/**
 * The Contact screen's shell (`apps/web/AGENTS.md` Structure: the `(record)` group;
 * `screens/27-contact.md`).
 *
 * The screen declares the record's masthead and the shared Footer. The group layout that will carry
 * both for every record route arrives with the public record task; until then this segment carries
 * them itself, as `/me` does, so the page closes in the same voice as the rest of the record.
 *
 * The page is public: a resident without a session reaches it, the rights route and the channel. The
 * shell resolves the session only to place the masthead — the recorded ward and the account's own
 * language when one is signed in, the sign-in door when none is — and treats an unreadable session
 * store as a signed-out visit rather than failing a page whose content is static.
 *
 * The footer's language switch is the screen's one write. It reaches `./actions`, which holds the
 * anonymous choice and writes a member's account locale, and returns to this page in the language
 * chosen.
 */
import type { ReactNode } from 'react';
import { RecordFooter, RecordHeader } from '@odp/ui';
import { getMessages, type LaunchLocale } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { presentedMemberSessionToken } from '../../../lib/session/session-cookies';
import { readWardName, resolveMyRecordSession } from '../me/_lib/runtime';
import { changeLocaleAction } from './actions';

export default async function ContactLayout({ children }: { readonly children: ReactNode }) {
  const token = await presentedMemberSessionToken();
  const session = await resolveMyRecordSession(token);
  const locale: LaunchLocale =
    session.kind === 'member' ? session.member.locale : await resolveLocale();
  const copy = getMessages(locale);

  const wardName = session.kind === 'member' ? await readWardName(session.member.wardId) : null;
  const ward =
    session.kind === 'member'
      ? {
          href: '/join/ward',
          label:
            session.member.wardStatus === 'resolved' && wardName !== null
              ? wardName
              : copy.myRecord.wardUnresolved,
        }
      : null;

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <RecordHeader
        productName={copy.brand.name}
        homeHref="/"
        markSrc="/brand/mark.svg"
        markAlt=""
        menuLabel={copy.footer.navLabel}
        destinations={[
          { href: '/', label: copy.footer.links.commitments },
          { href: '/declined', label: copy.footer.links.ledger },
          { href: '/report-card', label: copy.footer.links.reportCard },
          { href: '/me', label: copy.footer.links.myRecord },
        ]}
        ward={ward}
        signIn={
          session.kind === 'member'
            ? null
            : { href: '/sign-in?returnTo=%2Fcontact', label: copy.myRecord.signedOutAction }
        }
      />
      <div className="flex-1 pt-button pb-button tablet:pb-0">{children}</div>
      <RecordFooter
        disclosure={copy.footer.disclosure}
        navLabel={copy.footer.navLabel}
        recordLinks={[
          { href: '/commitments', label: copy.footer.links.commitments },
          { href: '/declined', label: copy.footer.links.ledger },
          { href: '/report-card', label: copy.footer.links.reportCard },
          { href: '/me', label: copy.footer.links.myRecord },
        ]}
        privacy={{ href: '/privacy', label: copy.footer.links.privacy }}
        contact={{ href: '/contact', label: copy.footer.links.contact }}
        dataRights={{ href: '/me', label: copy.footer.links.myRecord }}
        languageSwitch={{
          id: 'footer-locale',
          name: 'locale',
          legend: copy.footer.languageLegend,
          action: changeLocaleAction,
          currentValue: locale,
          options: [
            { value: 'en-NG', label: copy.footer.languages['en-NG'] },
            { value: 'yo-NG', label: copy.footer.languages['yo-NG'] },
          ],
          submitLabel: copy.footer.languageApply,
        }}
      />
    </div>
  );
}
