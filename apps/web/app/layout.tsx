/**
 * The document shell (`apps/web/AGENTS.md` Structure): language, skip link and the one main
 * landmark every route group renders into. The group layouts add their header and footer inside
 * it, so the record, the entry screens and the console never disagree about the document.
 *
 * The visible copy comes from the message catalogue (`NFR-044`): the skip link is named in the
 * locale in force, and `lang` carries the same locale so screen readers pick the right voice.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getMessages } from '../messages';
import { resolveLocale } from '../lib/i18n/locale';
import '../styles/globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const copy = getMessages(await resolveLocale());
  return {
    title: {
      default: copy.brand.name,
      template: `%s | ${copy.brand.name}`,
    },
    description: copy.brand.tagline,
  };
}

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const locale = await resolveLocale();
  const copy = getMessages(locale);

  return (
    <html lang={locale}>
      <body className="bg-surface text-text-primary font-body">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-surface focus:px-md focus:py-sm focus:text-body focus:text-text-primary"
        >
          {copy.shell.skipToContent}
        </a>
        <main id="content" aria-label={copy.shell.mainLabel}>
          {children}
        </main>
      </body>
    </html>
  );
}
