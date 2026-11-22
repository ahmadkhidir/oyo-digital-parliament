/**
 * The entry screen frame (`apps/web/AGENTS.md` Structure: the `(entry)` group; `screens/02`,
 * `screens/03`, `screens/04`).
 *
 * One frame holds the three entry screens so the register opens the same way every time:
 *
 * - **Desktop** - a margin rail on the left carries the mark, the tagline and the entry index;
 *   the screen's title and form sit in the reading column to its right. The rail is the page's
 *   margin in the literal sense: the thing you check before you write on the page.
 * - **Tablet and mobile** - the rail folds away and the index sits above the title, because the
 *   same facts belong on the page but the margin has nowhere to live. The primary action stays
 *   bottom-anchored inside the form (`branding.md`, Responsive & Device Targets).
 *
 * The frame authors no copy: the title, the tagline, the disclosure and the index entries all
 * arrive already translated. It is a Server Component and renders with scripting disabled.
 */
import type { ReactNode } from 'react';
import { BrandMark } from './brand-mark';

export interface EntryScreenProps {
  /** The screen's title, already translated; the page's only `h1`. */
  title: ReactNode;
  /** The brand tagline, already translated. */
  tagline: ReactNode;
  /** The campaign disclosure, already translated; closes the rail on desktop. */
  disclosure: ReactNode;
  /** The entry index, built by the page from the catalogue. */
  index: ReactNode;
  /** A quiet secondary route beside the title, such as the sign-in door (`screens/03` exits). */
  action?: ReactNode;
  /** The screen's content. */
  children: ReactNode;
}

export function EntryScreen({
  title,
  tagline,
  disclosure,
  index,
  action,
  children,
}: EntryScreenProps): ReactNode {
  return (
    <div className="mx-auto w-full max-w-6xl px-lg py-xl desktop:py-2xl">
      <div className="flex flex-col gap-xl desktop:grid desktop:grid-cols-3 desktop:gap-2xl">
        <aside className="hidden desktop:block">
          <div className="sticky top-xl flex flex-col gap-lg">
            <BrandMark className="size-2xl" />
            <p className="font-display text-h2 text-text-primary">{tagline}</p>
            {index}
            <p className="border-t border-border pt-md text-caption text-text-secondary">
              {disclosure}
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 max-w-2xl flex-col gap-lg desktop:col-span-2">
          <div className="desktop:hidden">{index}</div>
          <div className="flex flex-wrap items-baseline justify-between gap-sm border-b border-border pb-md">
            <h1 className="font-display text-display text-text-primary">{title}</h1>
            {action === undefined ? null : <div className="text-small">{action}</div>}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
