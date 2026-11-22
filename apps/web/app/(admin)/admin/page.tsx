/**
 * Admin Home — `docs/OyoDigitalParliament/screens/26-admin-home.md`.
 *
 * The landing answers what the signed-in role may work now. It reads no member record: the greeting
 * and the destination list come from the staff session and the role's own mapping. The Staff
 * credentials panel lives on this screen; its reset form is `C-093` and lands with the credential-reset
 * task, so this page carries the panel's heading, explanation and stable anchor without inventing a
 * second form here.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Notice, focusRingClasses } from '@odp/ui';
import { getMessages } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { readStaffAccess } from '../../../lib/staff-session/session';
import { destinationsForRole, type AdminDestinationKey } from '../../../lib/staff-session/destinations';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).staff.admin.title };
}

/** The catalogue key for one destination's label. */
function labelFor(
  key: AdminDestinationKey,
  messages: ReturnType<typeof getMessages>,
): string {
  switch (key) {
    case 'ward-review':
      return messages.staff.wards.title;
    case 'data-requests':
      return messages.staff.dataRequests.title;
    case 'staff-credentials':
      return messages.staff.admin.credentialsEntry;
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
}

export default async function AdminHomePage({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}) {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in?ended=1');
  if (access.kind === 'challenge') redirect('/staff/2fa');
  if (access.kind === 'degraded') {
    // The layout already renders the degraded state; this guard keeps the page honest if it is
    // reached through a composition that skips the layout.
    redirect('/admin');
  }

  const query = await searchParams;
  const recoveryUsed = query['notice'] === 'recovery-code-used';
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.staff.admin;
  const destinations = destinationsForRole(access.staff.role);

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-col gap-xs">
        <p className="text-small text-text-secondary">{copy.roleLabel}</p>
        <h1 className="font-display text-display text-text-primary">
          {copy.roles[access.staff.role]}
        </h1>
      </div>

      {recoveryUsed ? (
        <Notice role="status" tone="info">
          {messages.staff.totp.recoveryUsed}
        </Notice>
      ) : null}

      <section aria-labelledby="destinations-heading" className="flex flex-col gap-md">
        <h2 id="destinations-heading" className="font-display text-h2 text-text-primary">
          {copy.destinationsHeading}
        </h2>
        {destinations.length === 0 ? (
          <Notice role="status" tone="info">
            {copy.empty}
          </Notice>
        ) : (
          <ul className="grid gap-md tablet:grid-cols-2 desktop:grid-cols-3">
            {destinations.map((destination) => (
              <li key={destination.key}>
                <a
                  href={destination.href}
                  className={`flex min-h-button flex-col justify-between gap-sm rounded-sm border border-border bg-surface p-md text-text-primary hover:bg-surface-muted ${focusRingClasses}`}
                >
                  <span className="font-display text-h3">{labelFor(destination.key, messages)}</span>
                  <span className="text-small text-text-secondary">{copy.open}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {access.staff.role === 'operator' ? (
        <section
          id="staff-credentials"
          aria-labelledby="credentials-heading"
          className="flex scroll-mt-xl flex-col gap-xs border-t border-border pt-lg"
        >
          <h2 id="credentials-heading" className="font-display text-h2 text-text-primary">
            {copy.credentialsHeading}
          </h2>
          <p className="max-w-prose text-body text-text-secondary">{copy.credentialsBody}</p>
        </section>
      ) : null}
    </div>
  );
}
