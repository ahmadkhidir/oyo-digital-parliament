/**
 * The guarded staff shell (`screens/26-admin-home.md`, `apps/web/AGENTS.md` Structure).
 *
 * No admin screen renders before the staff session exists and its second factor is satisfied. The
 * layout resolves the same session every child does, so a page that forgets to check still cannot be
 * reached without one; the pages and actions re-check role and factor themselves rather than
 * trusting this guard.
 *
 * The header carries the product name, the signed-in staff member and the sign-out action. It reads
 * no member record, so no resident's name, number or ward description can appear in it.
 */
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Notice, focusRingClasses } from '@odp/ui';
import { getMessages } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { readStaffAccess } from '../../../lib/staff-session/session';
import { signOutStaffAction } from '../../../lib/staff-session/actions';

export default async function AdminLayout({ children }: { readonly children: ReactNode }) {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in?ended=1');
  if (access.kind === 'challenge') redirect('/staff/2fa');

  const locale = await resolveLocale();
  const messages = getMessages(locale);

  if (access.kind === 'degraded') {
    return (
      <div className="mx-auto w-full max-w-4xl px-lg py-2xl">
        <h1 className="font-display text-display text-text-primary">
          {messages.staff.admin.errorHeading}
        </h1>
        <Notice role="alert" tone="error">
          {messages.staff.admin.errorBody}
        </Notice>
        <a
          href="/admin"
          className={`mt-md inline-flex min-h-button items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
        >
          {messages.staff.admin.retry}
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-md px-lg py-md">
          <a href="/admin" className={`inline-flex items-center rounded-sm ${focusRingClasses}`}>
            <span className="font-display text-h3 text-text-primary">
              {messages.brand.name}
            </span>
          </a>
          <div className="flex flex-wrap items-center gap-md">
            <p className="text-small text-text-secondary">
              {messages.staff.admin.greeting.replace('{name}', access.staff.fullName)}
            </p>
            <form action={signOutStaffAction}>
              <button
                type="submit"
                className={`inline-flex min-h-button items-center rounded-sm border border-border px-md text-small text-text-primary hover:bg-surface-muted ${focusRingClasses}`}
              >
                {messages.staff.admin.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-6xl flex-1 px-lg py-xl">
        {children}
      </main>
      <footer className="border-t border-border">
        <p className="mx-auto w-full max-w-6xl px-lg py-md text-caption text-text-secondary">
          {messages.staff.admin.note}
        </p>
      </footer>
    </div>
  );
}
