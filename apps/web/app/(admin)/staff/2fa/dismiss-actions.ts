'use server';

/**
 * Leaving the recovery-code screen (`screens/25-staff-totp.md` Enrolled state).
 *
 * The codes are shown once; this action clears the sealed cookie as the staff member continues, so a
 * back navigation cannot display them a second time. It changes no record and calls no contract.
 *
 * It is still a `C-001` surface: a malformed `X-Correlation-Id` is refused with the contract's
 * failure envelope before any cookie is cleared, so a refused call leaves the codes where they were.
 */
import { redirect } from 'next/navigation';
import {
  actionRefusal,
  readActionRequest,
  type ActionFailureEnvelope,
} from '../../../../lib/http/rate-limit';
import {
  clearEnrolmentCookie,
  clearRecoveryCookie,
  clearStaffFlow,
} from '../../../../lib/staff-session/cookies';

export async function dismissRecoveryCodesAction(): Promise<void>;
export async function dismissRecoveryCodesAction(): Promise<ActionFailureEnvelope | void> {
  const request = await readActionRequest();
  if (!request.correlation.ok) {
    return actionRefusal(request.correlation, request.rateLimit) ?? undefined;
  }

  await clearRecoveryCookie();
  await clearEnrolmentCookie();
  await clearStaffFlow();
  redirect('/admin');
}
