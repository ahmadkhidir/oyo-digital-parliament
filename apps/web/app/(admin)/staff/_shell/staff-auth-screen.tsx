/**
 * The staff authentication frame (`screens/24-staff-sign-in.md`, `screens/25-staff-totp.md`).
 *
 * The two factor screens share one minimal shell: the product name returns to the record home, the
 * screen's title is the only `h1`, and the access note sits under it. It is a Server Component, so
 * both screens render and post with scripting disabled.
 */
import type { ReactNode } from 'react';
import { focusRingClasses } from '@odp/ui';

export interface StaffAuthScreenProps {
  readonly productName: string;
  readonly title: string;
  readonly disclosure: string;
  readonly children: ReactNode;
  /** The other door on this screen: the resident sign-in, or the staff sign-in. */
  readonly aside?: ReactNode;
}

export function StaffAuthScreen({
  productName,
  title,
  disclosure,
  children,
  aside,
}: StaffAuthScreenProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-4xl items-center px-lg py-md">
          <a href="/" className={`inline-flex items-center rounded-sm ${focusRingClasses}`}>
            <span className="font-display text-h3 text-text-primary">{productName}</span>
          </a>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-xl px-lg py-2xl">
        <div className="flex flex-col gap-lg">
          <div className="flex flex-col gap-xs border-b border-border pb-md">
            <h1 className="font-display text-display text-text-primary">{title}</h1>
            {aside}
          </div>
          {children}
        </div>
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto w-full max-w-4xl px-lg py-md text-caption text-text-secondary">
          {disclosure}
        </p>
      </footer>
    </div>
  );
}
