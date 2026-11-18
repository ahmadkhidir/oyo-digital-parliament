/**
 * The entry group's shell (`apps/web/AGENTS.md` Structure): the screens a visitor reaches without
 * an account — registration, its confirmation, sign-in and the privacy notice — under a minimal
 * header (the product name, which returns to the record home) and the shared footer.
 *
 * This layout exists because a route tree cannot render without a group shell; it is a shared
 * module created by the first entry task and reused by the ones that follow (sign-in, the ward
 * screen, the privacy notice). The footer is the shared component `screens.md` names, with the
 * language switch wired to the visitor's session choice (`C-039`, signed-out branch: the choice is
 * held for the session and applied to the PendingRegistration at `C-002`; a member's own locale
 * becomes authoritative after sign-in and is written by the task that owns the member surface).
 */
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { RecordFooter } from '@odp/ui';
import { getMessages } from '../../messages';
import { LOCALE_COOKIE, readLocaleValue, resolveLocale } from '../../lib/i18n/locale';

/**
 * The visitor's language choice (`C-039`, signed out).
 *
 * The signed-in branch — writing `Member.locale` — belongs to the member-surface task; on the
 * entry screens every visitor is anonymous, so this stores the session-scoped choice only. A
 * value outside the two launch locales is ignored rather than guessed at.
 */
async function setLocaleAction(formData: FormData): Promise<void> {
  'use server';
  const locale = readLocaleValue(String(formData.get('locale') ?? ''));
  if (locale !== null) {
    const store = await cookies();
    store.set(LOCALE_COOKIE, locale, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
    });
  }
}

export default async function EntryLayout({ children }: { readonly children: ReactNode }) {
  const locale = await resolveLocale();
  const copy = getMessages(locale);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-surface px-md py-sm">
        {/* The product name link: names the product and returns to the record home (`screens/03`). */}
        <a href="/" className="inline-flex flex-col">
          <span className="text-body-strong text-text-primary">{copy.brand.name}</span>
          <span className="text-small text-text-secondary">{copy.brand.tagline}</span>
        </a>
      </header>
      <div className="flex-1">{children}</div>
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
        // The published contact address is stated on the privacy notice (`screens/23`); the entry
        // screens link there until the notice lands and names its own anchor.
        contact={{ href: '/privacy', label: copy.footer.links.contact }}
        dataRights={{ href: '/me', label: copy.footer.links.myRecord }}
        languageSwitch={{
          id: 'footer-locale',
          name: 'locale',
          legend: copy.footer.languageLegend,
          action: setLocaleAction,
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
