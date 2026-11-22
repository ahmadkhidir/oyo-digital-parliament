'use server';

/**
 * Leaving the recovery-code screen (`screens/25-staff-totp.md` Enrolled state).
 *
 * The codes are shown once; this action clears the sealed cookie as the staff member continues, so a
 * back navigation cannot display them a second time. It changes no record and calls no contract.
 */
import { redirect } from 'next/navigation';
import { clearEnrolmentCookie, clearRecoveryCookie, clearStaffFlow } from '../../../../lib/staff-session/cookies';

export async function dismissRecoveryCodesAction(): Promise<void> {
  await clearRecoveryCookie();
  await clearEnrolmentCookie();
  await clearStaffFlow();
  redirect('/admin');
}
