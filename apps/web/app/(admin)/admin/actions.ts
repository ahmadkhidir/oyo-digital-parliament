'use server';

/**
 * The operator's credential reset (`C-093`, `screens/26-admin-home.md` Staff credentials).
 *
 * One write, named `resetStaffCredential`, posted from the panel on Admin Home. The action re-checks
 * the staff session, the operator role and the satisfied second factor itself rather than trusting the
 * layout, and it never puts the new password in a URL, a cookie or a log: the field is read from the
 * form, passed to the domain, and dropped.
 *
 * The outcome is carried back as a query token the panel renders, because the password must not ride
 * in the flow cookie and the success sentence needs the session count.
 */
import { redirect } from 'next/navigation';
import { resetStaffCredential } from '@odp/domain';
import { resolveLocale } from '../../../lib/i18n/locale';
import { readStaffAccess, staffCaller } from '../../../lib/staff-session/session';
import { newIdempotencyKey } from '../../../lib/staff-session/request';
import { getStaffResetDependencies } from './_credentials/deps';

/** Reads one string field from the form. */ function readField(
  formData: FormData,
  name: string,
): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Applies the submitted reset and returns to the panel with the state it left. */
export async function resetStaffCredentialAction(formData: FormData): Promise<void> {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in?ended=1');
  if (access.kind === 'challenge') redirect('/staff/2fa');
  if (access.kind === 'degraded' || access.staff.role !== 'operator') {
    redirect('/admin?reset=error#staff-credentials');
  }

  const locale = await resolveLocale();
  const { dependencies, reset } = await getStaffResetDependencies();

  const result = await resetStaffCredential(
    staffCaller(access, locale),
    {
      credentials: dependencies.identity.credentials,
      reset,
      staffUsers: dependencies.identity.staffUsers,
      staffSessions: dependencies.identity.staffSessions,
      rateLimits: dependencies.identity.rateLimits,
      idempotency: dependencies.identity.idempotency,
      audit: dependencies.identity.audit,
      clock: dependencies.identity.clock,
      identifiers: dependencies.identity.identifiers,
    },
    {
      staffUserId: readField(formData, 'staffUserId'),
      newPassword: readField(formData, 'newPassword'),
      reason: readField(formData, 'reason'),
      idempotencyKey: newIdempotencyKey(),
    },
  );

  if (result.ok) {
    redirect(`/admin?reset=applied&ended=${result.sessionsEnded}#staff-credentials`);
  }
  if (result.cause === 'SELF_RESET_REQUIRES_SECOND_OPERATOR') {
    redirect('/admin?reset=self#staff-credentials');
  }
  redirect('/admin?reset=error#staff-credentials');
}
