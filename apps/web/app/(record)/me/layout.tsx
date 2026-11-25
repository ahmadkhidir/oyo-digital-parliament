/**
 * The member surface's shell (`apps/web/AGENTS.md` Structure: the `(record)` group).
 *
 * The Record Header and Footer belong to the group layout, but that layout arrives with the public
 * record task. Until it exists this segment carries them itself, so `/me` renders under the same
 * masthead and colophon as the rest of the record rather than in a bare page.
 *
 * The header names the ward the record is placed in and the sign-in state; the footer carries the
 * campaign disclosure, the record links, the privacy notice, the contact route, My Record and the
 * language switch. On this segment the switch is the account's own language (`C-033`), and a
 * visitor without an account has their choice held for the session, exactly as the entry screens
 * do (`C-039`).
 */
import type { ReactNode } from 'react';
import { RecordFooter, RecordHeader } from '@odp/ui';
import { getMessages, type LaunchLocale } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { presentedMemberSessionToken } from '../../../lib/session/session-cookies';
import { readWardName, resolveMyRecordSession } from './_lib/runtime';
import { correctMyDetailsAction } from './actions';

export default async function MyRecordLayout({ children }: { readonly children: ReactNode }) {
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
            : { href: '/sign-in?returnTo=%2Fme', label: copy.myRecord.signedOutAction }
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
          action: correctMyDetailsAction,
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
