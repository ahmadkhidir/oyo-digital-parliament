/**
 * The document shell (`apps/web/AGENTS.md` Structure): language, skip link and the one main
 * landmark every route group renders into. The group layouts add their header and footer inside
 * it, so the record, the entry screens and the console never disagree about the document.
 *
 * The visible copy comes from the message catalogue (`NFR-044`): the skip link is named in the
 * locale in force, and `lang` carries the same locale so screen readers pick the right voice.
 */
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getMessages } from '../messages';
import { resolveLocale } from '../lib/i18n/locale';
import '../styles/globals.css';

/** The favicon and touch icon slots (`assets/ASSETS.md` A-005 to A-010), served from `/brand/`. */
const ICONS: Metadata['icons'] = {
  icon: [
    { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
    { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
  ],
  apple: [{ url: '/brand/apple-touch-icon-180.png', sizes: '180x180', type: 'image/png' }],
};

/**
 * The browser chrome colour is the structural `theme-color` mapping in `branding.md`
 * (`primary-900`, light column). A metadata value cannot read a custom property, so the declared
 * token value is restated here and nowhere else.
 */
export const viewport: Viewport = { themeColor: '#2E1108' };

export async function generateMetadata(): Promise<Metadata> {
  const copy = getMessages(await resolveLocale());
  return {
    title: {
      default: copy.brand.name,
      template: `%s | ${copy.brand.name}`,
    },
    description: copy.brand.tagline,
    icons: ICONS,
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
