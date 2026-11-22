'use server';

/**
 * The second factor (`C-092`, `screens/25-staff-totp.md`).
 *
 * Three exported actions, one per contract operation the screen posts to: verify an existing factor,
 * begin an enrolment, and confirm it. The confirming answer is the one place recovery codes are
 * issued; they are sealed into a ten-minute cookie for the one render that shows them, then cleared.
 * Every action redirects, so the no-scripting path is the same flow.
 */
import { redirect } from 'next/navigation';
import {
  enrolStaffSecondFactor,
  verifyStaffSecondFactor,
  type EnrolStaffSecondFactorResult,
  type IdentityFailure,
  type VerifyStaffSecondFactorResult,
} from '@odp/domain';
import { newCorrelationId } from '../../../../lib/logging';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import { readStaffAccess, staffCaller } from '../../../../lib/staff-session/session';
import {
  clearEnrolmentCookie,
  clearStaffFlow,
  clearStaffSessionCookie,
  setStaffSessionCookie,
  writeEnrolmentCookie,
  writeRecoveryCookie,
  writeStaffFlow,
  type StaffFlowCause,
} from '../../../../lib/staff-session/cookies';
import { newIdempotencyKey } from '../../../../lib/staff-session/request';

/** Reads one string field from the form. */
function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** A factor refusal as the screen's own cause token and the numbers it carries. */
function factorRefusal(failure: IdentityFailure): {
  readonly cause: StaffFlowCause;
  readonly retryAfterSeconds?: number;
} {
  switch (failure.cause) {
    case 'SECOND_FACTOR_INCORRECT':
      return { cause: 'SECOND_FACTOR_INCORRECT' };
    case 'RECOVERY_CODE_UNKNOWN':
      return { cause: 'RECOVERY_CODE_UNKNOWN' };
    case 'RECOVERY_CODE_SPENT':
      return { cause: 'RECOVERY_CODE_SPENT' };
    case 'ACCOUNT_LOCKED':
      return {
        cause: 'ACCOUNT_LOCKED',
        ...(failure.retryAfterSeconds === undefined
          ? {}
          : { retryAfterSeconds: failure.retryAfterSeconds }),
      };
    case 'SECOND_FACTOR_INVALID':
      return { cause: 'SECOND_FACTOR_INVALID' };
    case 'SECOND_FACTOR_NOT_ENROLLED':
      return { cause: 'SECOND_FACTOR_NOT_ENROLLED' };
    case 'SECOND_FACTOR_ALREADY_ENROLLED':
      return { cause: 'SECOND_FACTOR_ALREADY_ENROLLED' };
    case 'SECOND_FACTOR_CHALLENGE_EXPIRED':
      return { cause: 'SECOND_FACTOR_CHALLENGE_EXPIRED' };
    default:
      return { cause: 'DEGRADED' };
  }
}

/**
 * Verifies one six-digit code or one recovery code against the challenge session.
 *
 * A spent recovery code is accepted with the notice the screen states; a wrong code is refused with
 * the reason and the field cleared. A challenge that has run out returns to the password step.
 */
export async function verifyStaffSecondFactorAction(formData: FormData): Promise<void> {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in');
  if (access.kind === 'degraded') {
    await writeStaffFlow({ cause: 'DEGRADED' });
    redirect('/staff/2fa');
  }
  if (access.kind === 'ready') redirect('/admin');

  const dependencies = await getStaffAdminDependencies();
  const correlationId = newCorrelationId();
  const locale = await resolveLocale();
  const result: VerifyStaffSecondFactorResult = await verifyStaffSecondFactor(
    staffCaller(access, locale, correlationId),
    dependencies.identity,
    {
      idempotencyKey: newIdempotencyKey(),
      ...(readField(formData, 'recoveryCode') === ''
        ? { code: readField(formData, 'code') }
        : { recoveryCode: readField(formData, 'recoveryCode') }),
    },
  );

  if (!result.ok) {
    if (result.cause === 'SECOND_FACTOR_CHALLENGE_EXPIRED') {
      await clearStaffSessionCookie();
      await writeStaffFlow({ cause: 'SECOND_FACTOR_CHALLENGE_EXPIRED', notice: 'PASSWORD_REQUIRED' });
      redirect('/staff/sign-in');
    }
    await writeStaffFlow(factorRefusal(result));
    redirect('/staff/2fa');
  }

  if (result.cookie !== undefined) await setStaffSessionCookie(result.cookie);
  await clearStaffFlow();
  redirect(
    readField(formData, 'recoveryCode') === '' ? '/admin' : '/admin?notice=recovery-code-used',
  );
}

/** Begins one enrolment and shows the `otpauth` secret exactly once. */
export async function beginStaffEnrolmentAction(): Promise<void> {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in');
  if (access.kind === 'degraded') {
    await writeStaffFlow({ cause: 'DEGRADED' });
    redirect('/staff/2fa');
  }
  if (access.kind === 'ready') redirect('/admin');

  const dependencies = await getStaffAdminDependencies();
  const locale = await resolveLocale();
  const result: EnrolStaffSecondFactorResult = await enrolStaffSecondFactor(
    staffCaller(access, locale),
    dependencies.identity,
    { action: 'begin', idempotencyKey: newIdempotencyKey() },
  );

  if (!result.ok) {
    await writeStaffFlow(factorRefusal(result));
    redirect('/staff/2fa');
  }
  if (result.action !== 'begin') redirect('/staff/2fa');

  await writeEnrolmentCookie(
    { secret: result.totp.secret, otpauthUri: result.totp.otpauthUri },
    dependencies.credentials.cipher.seal,
  );
  await clearStaffFlow();
  redirect('/staff/2fa');
}

/** Confirms the enrolment code, issues the recovery codes and satisfies the session. */
export async function confirmStaffEnrolmentAction(formData: FormData): Promise<void> {
  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in');
  if (access.kind === 'degraded') {
    await writeStaffFlow({ cause: 'DEGRADED' });
    redirect('/staff/2fa');
  }
  if (access.kind === 'ready') redirect('/admin');

  const dependencies = await getStaffAdminDependencies();
  const locale = await resolveLocale();
  const result: EnrolStaffSecondFactorResult = await enrolStaffSecondFactor(
    staffCaller(access, locale),
    dependencies.identity,
    {
      action: 'confirm',
      code: readField(formData, 'code'),
      idempotencyKey: newIdempotencyKey(),
    },
  );

  if (!result.ok) {
    if (result.cause === 'SECOND_FACTOR_CHALLENGE_EXPIRED') {
      await clearStaffSessionCookie();
      await writeStaffFlow({ cause: 'SECOND_FACTOR_CHALLENGE_EXPIRED', notice: 'PASSWORD_REQUIRED' });
      redirect('/staff/sign-in');
    }
    await writeStaffFlow(factorRefusal(result));
    redirect('/staff/2fa');
  }
  if (result.action !== 'confirm') redirect('/staff/2fa');

  if (result.cookie !== undefined) await setStaffSessionCookie(result.cookie);
  await writeRecoveryCookie(
    { codes: result.recoveryCodes },
    dependencies.credentials.cipher.seal,
  );
  await clearEnrolmentCookie();
  await clearStaffFlow();
  redirect('/staff/2fa?enrolled=1');
}
