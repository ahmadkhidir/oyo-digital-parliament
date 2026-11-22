/**
 * Admin Home — `docs/OyoDigitalParliament/screens/26-admin-home.md`.
 *
 * The landing answers what the signed-in role may work now. It reads no member record: the greeting
 * and the destination list come from the staff session and the role's own mapping. The Staff
 * credentials panel is the operator's own destination and renders here (`C-093`); its list is read
 * inside a Suspense boundary so the panel has its declared loading state while the destinations are
 * already readable.
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Notice, focusRingClasses } from '@odp/ui';
import { getMessages } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { readStaffAccess, staffCaller } from '../../../lib/staff-session/session';
import {
  destinationsForRole,
  type AdminDestinationKey,
} from '../../../lib/staff-session/destinations';
import { StaffCredentialsPanel, type CredentialsOutcome } from './_credentials/panel';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).staff.admin.title };
}

/**
 * The credential-reset state the panel states after its action's redirect.
 *
 * Only the outcome and the session count travel: no password, staff name or identifier enters the
 * URL, and the count is not personal data.
 */
function credentialsOutcome(
  query: Readonly<Record<string, string | string[] | undefined>>,
): CredentialsOutcome {
  const outcome = query['reset'];
  if (outcome === 'applied') {
    const raw = typeof query['ended'] === 'string' ? Number.parseInt(query['ended'], 10) : 0;
    const ended = Number.isSafeInteger(raw) && raw > 0 ? raw : 0;
    return { kind: 'applied', ended };
  }
  if (outcome === 'self') return { kind: 'self' };
  if (outcome === 'error') return { kind: 'error' };
  return null;
}

/** The catalogue key for one destination's label. */
function labelFor(key: AdminDestinationKey, messages: ReturnType<typeof getMessages>): string {
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
  const outcome = credentialsOutcome(query);

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
                  <span className="font-display text-h3">
                    {labelFor(destination.key, messages)}
                  </span>
                  <span className="text-small text-text-secondary">{copy.open}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {access.staff.role === 'operator' ? (
        <Suspense
          fallback={
            <section
              id="staff-credentials"
              aria-labelledby="credentials-heading"
              aria-busy="true"
              className="flex scroll-mt-xl flex-col gap-md border-t border-border pt-lg"
            >
              <h2 id="credentials-heading" className="font-display text-h2 text-text-primary">
                {copy.credentialsHeading}
              </h2>
              <p className="max-w-prose text-body text-text-secondary">{copy.credentialsBody}</p>
              <p className="text-small text-text-secondary">{copy.credentialsLoading}</p>
              <div className="h-24 animate-pulse rounded-sm bg-surface-muted" aria-hidden="true" />
            </section>
          }
        >
          <StaffCredentialsPanel caller={staffCaller(access, locale)} outcome={outcome} />
        </Suspense>
      ) : null}
    </div>
  );
}
