/**
 * Staff TOTP — `docs/OyoDigitalParliament/screens/25-staff-totp.md`, wired to `C-092`
 * (`app/(admin)/staff/2fa/actions.ts`).
 *
 * The screen is both the challenge and the one-time enrolment:
 *
 * - an enrolled challenge shows the six-digit field, the recovery-code door and the confirm action;
 * - an unenrolled challenge shows the `otpauth` secret, the recovery-code explanation and the
 *   six-digit field that finishes enrolment;
 * - the confirming answer's recovery codes render once, then the staff member opens the console.
 *
 * A session that has satisfied its factor leaves this screen for `/admin`, and a caller with no
 * session at all returns to `/staff/sign-in`.
 */
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Notice } from '@odp/ui';
import { getMessages } from '../../../../messages';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { getStaffAdminDependencies } from '../../../../lib/staff-session/deps';
import { readStaffAccess } from '../../../../lib/staff-session/session';
import {
  readEnrolmentCookie,
  readRecoveryCookie,
  readStaffFlow,
} from '../../../../lib/staff-session/cookies';
import { FlowField } from '../../../(entry)/join/_shared/field';
import { GuardedSubmit, OfflineNote } from '../../../(entry)/join/_shared/offline';
import { StaffAuthScreen } from '../_shell/staff-auth-screen';
import { DownloadCodes } from './_shared/download-codes';
import {
  beginStaffEnrolmentAction,
  confirmStaffEnrolmentAction,
  verifyStaffSecondFactorAction,
} from './actions';
import { dismissRecoveryCodesAction } from './dismiss-actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).staff.totp.title };
}

interface TotpPageProps {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>;
}

export default async function StaffTotpPage({ searchParams }: TotpPageProps) {
  const query = await searchParams;
  const enrolledView = query['enrolled'] === '1';
  const recoveryMode = query['mode'] === 'recovery';

  const access = await readStaffAccess();
  if (access.kind === 'signed_out') redirect('/staff/sign-in?ended=1');

  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.staff.totp;
  const flow = await readStaffFlow();
  const dependencies = await getStaffAdminDependencies();

  if (access.kind === 'ready') {
    const issued = enrolledView
      ? await readRecoveryCookie(dependencies.credentials.cipher.open)
      : null;
    if (issued === null) redirect('/admin');

    return (
      <StaffAuthScreen
        productName={messages.brand.name}
        title={copy.recoveryCodesHeading}
        disclosure={messages.footer.disclosure}
      >
        <Notice role="status" tone="info">
          {copy.recoveryNote}
        </Notice>
        <ul className="grid grid-cols-2 gap-sm font-display text-body tabular-nums text-text-primary tablet:grid-cols-3">
          {issued.codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <DownloadCodes codes={issued.codes} label={copy.downloadCodes} />
        <form action={dismissRecoveryCodesAction}>
          <GuardedSubmit
            variant="primary"
            className="w-full"
            label={copy.continueToAdmin}
            sendingLabel={copy.continueToAdmin}
            offlineLabel={copy.continueToAdmin}
          />
        </form>
      </StaffAuthScreen>
    );
  }

  if (access.kind === 'degraded') {
    return (
      <StaffAuthScreen
        productName={messages.brand.name}
        title={copy.heading}
        disclosure={messages.footer.disclosure}
      >
        <Notice role="alert" tone="error">
          {copy.error}
        </Notice>
      </StaffAuthScreen>
    );
  }

  const notice =
    flow?.cause === 'SECOND_FACTOR_INCORRECT'
      ? copy.invalidCode
      : flow?.cause === 'RECOVERY_CODE_UNKNOWN'
        ? copy.recoveryUnknown
        : flow?.cause === 'RECOVERY_CODE_SPENT'
          ? copy.recoverySpent
          : flow?.cause === 'ACCOUNT_LOCKED'
            ? copy.lockout
            : flow?.cause === 'SECOND_FACTOR_NOT_ENROLLED'
              ? copy.notEnrolled
              : flow?.cause === 'SECOND_FACTOR_ALREADY_ENROLLED'
                ? copy.alreadyEnrolled
                : flow?.cause === 'DEGRADED'
                  ? copy.error
                  : null;

  if (!access.staff.secondFactorEnrolled) {
    const enrolment = await readEnrolmentCookie(dependencies.credentials.cipher.open);
    return (
      <StaffAuthScreen
        productName={messages.brand.name}
        title={copy.heading}
        disclosure={messages.footer.disclosure}
      >
        <p className="max-w-prose text-body text-text-primary">{copy.stepNote}</p>
        <p className="text-small text-text-secondary">{copy.enrolmentNote}</p>
        {notice === null ? null : (
          <Notice role="alert" tone="error">
            {notice}
          </Notice>
        )}

        {enrolment === null ? (
          <form action={beginStaffEnrolmentAction}>
            <GuardedSubmit
              variant="primary"
              className="w-full"
              label={copy.startEnrolment}
              sendingLabel={copy.startEnrolment}
              offlineLabel={copy.error}
            />
          </form>
        ) : (
          <div className="flex flex-col gap-lg">
            <div className="flex flex-col gap-xs rounded-sm border border-border p-md">
              <h2 className="font-display text-h3 text-text-primary">{copy.secretLabel}</h2>
              <p className="break-all font-display text-body tabular-nums text-text-primary">
                {enrolment.secret}
              </p>
              <p className="break-all text-caption text-text-secondary">{enrolment.otpauthUri}</p>
              <p className="text-small text-text-secondary">{copy.secretHint}</p>
            </div>
            <form action={confirmStaffEnrolmentAction} className="flex flex-col gap-md">
              <FlowField
                id="enrolment-code"
                label={copy.code.label}
                hint={copy.code.hint}
                input={{
                  name: 'code',
                  type: 'text',
                  inputMode: 'numeric',
                  autoComplete: 'one-time-code',
                  maxLength: 6,
                  required: true,
                  className: 'text-center font-display text-h1 tabular-nums',
                }}
              />
              <GuardedSubmit
                variant="primary"
                className="w-full"
                label={copy.confirmEnrolment}
                sendingLabel={copy.confirming}
                offlineLabel={copy.error}
              />
            </form>
          </div>
        )}
      </StaffAuthScreen>
    );
  }

  return (
    <StaffAuthScreen
      productName={messages.brand.name}
      title={copy.heading}
      disclosure={messages.footer.disclosure}
      aside={
        <a href="/staff/sign-in" className="text-small text-primary-500 underline underline-offset-2">
          {messages.staff.signIn.heading}
        </a>
      }
    >
      <p className="max-w-prose text-body text-text-primary">{copy.stepNote}</p>
      {notice === null ? null : (
        <Notice role="alert" tone="error">
          {notice}
        </Notice>
      )}

      {recoveryMode ? (
        <>
          <form action={verifyStaffSecondFactorAction} className="flex flex-col gap-md">
            <FlowField
              id="recovery-code"
              label={copy.recoveryCode.label}
              hint={copy.recoveryCode.hint}
              input={{ name: 'recoveryCode', type: 'text', autoComplete: 'off', required: true }}
            />
            <GuardedSubmit
              variant="primary"
              className="w-full"
              label={copy.confirm}
              sendingLabel={copy.confirming}
              offlineLabel={copy.error}
            />
          </form>
          <a href="/staff/2fa" className="text-small text-primary-500 underline underline-offset-2">
            {copy.useAuthenticator}
          </a>
        </>
      ) : (
        <>
          <form action={verifyStaffSecondFactorAction} className="flex flex-col gap-md">
            <FlowField
              id="totp-code"
              label={copy.code.label}
              hint={copy.code.hint}
              input={{
                name: 'code',
                type: 'text',
                inputMode: 'numeric',
                autoComplete: 'one-time-code',
                maxLength: 6,
                required: true,
                className: 'text-center font-display text-h1 tabular-nums',
              }}
            />
            <OfflineNote message={copy.error} />
            <GuardedSubmit
              variant="primary"
              className="w-full"
              label={copy.confirm}
              sendingLabel={copy.confirming}
              offlineLabel={copy.error}
            />
          </form>
          <a
            href="/staff/2fa?mode=recovery"
            className="text-small text-primary-500 underline underline-offset-2"
          >
            {copy.useRecovery}
          </a>
        </>
      )}
    </StaffAuthScreen>
  );
}
