/**
 * The entry group's shell (`apps/web/AGENTS.md` Structure): the screens a visitor reaches without
 * an account - registration, its confirmation, sign-in and, in a later task, the privacy notice -
 * under the register's masthead and the shared footer.
 *
 * The masthead is the minimal header these screens declare: the mark bound to the product name,
 * which returns to the record home, with the tagline under the name where the margin rail cannot
 * carry it (tablet and mobile). It sits on the paper surface with a single rule beneath - the
 * register's cover, not a navigation bar.
 *
 * The footer is the shared component `screens.md` names, with the language switch wired to the
 * visitor's session choice (`C-039`, signed-out branch: the choice is held for the session and
 * applied to the PendingRegistration at `C-002`; a member's own locale becomes authoritative after
 * sign-in and is written by the task that owns the member surface).
 */
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { RecordFooter, focusRingClasses } from '@odp/ui';
import { getMessages } from '../../messages';
import {
  actionRefusal,
  readActionRequest,
  type ActionFailureEnvelope,
} from '../../lib/http/rate-limit';
import { LOCALE_COOKIE, readLocaleValue, resolveLocale } from '../../lib/i18n/locale';
import { BrandMark } from './_shell/brand-mark';

/**
 * The visitor's language choice (`C-039`, signed out).
 *
 * The signed-in branch - writing `Member.locale` - belongs to the member-surface task; on the
 * entry screens every visitor is anonymous, so this stores the session-scoped choice only. A
 * value outside the two launch locales is ignored rather than guessed at.
 *
 * The action is a `C-001` surface: the caller's `X-Correlation-Id` is read through the shared
 * reader, and a value outside the pattern is refused with the contract's failure envelope before
 * the choice is stored. The footer's form has no channel for the envelope, so a browser re-renders
 * with the previous language in force and nothing written.
 */
async function setLocaleAction(formData: FormData): Promise<void>;
async function setLocaleAction(formData: FormData): Promise<ActionFailureEnvelope | void> {
  'use server';
  const request = await readActionRequest();
  if (!request.correlation.ok) {
    return actionRefusal(request.correlation, request.rateLimit) ?? undefined;
  }

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
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl items-center px-lg py-md">
          <a href="/" className={`inline-flex items-center gap-sm rounded-sm ${focusRingClasses}`}>
            <BrandMark className="size-button" />
            <span className="flex flex-col">
              <span className="text-body-strong text-text-primary">{copy.brand.name}</span>
              {/* The tagline lives in the margin rail from desktop; here it closes the lockup. */}
              <span className="text-caption text-text-secondary desktop:hidden">
                {copy.brand.tagline}
              </span>
            </span>
          </a>
        </div>
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
        // Every footer opens the Contact screen (`screens/27-contact.md`), which carries the
        // published channel and the privacy mailbox when no form is configured.
        contact={{ href: '/contact', label: copy.footer.links.contact }}
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
