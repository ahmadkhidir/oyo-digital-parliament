/**
 * The Staff credentials panel (`C-093`, `screens/26-admin-home.md` Staff credentials).
 *
 * It lists the staff accounts that hold a credential, each with its role, active state and second
 * factor status, and resets one when the operator confirms. It reads no member record, returns no part
 * of a credential, and shows no password, second-factor secret or recovery code.
 *
 * The list read runs in this async component so the route can render the panel's own loading skeleton
 * while the rest of the landing is already readable.
 */
import { Notice, focusRingClasses } from '@odp/ui';
import { readStaffResetTargets, type IdentityCaller } from '@odp/domain';
import { OfflineNote } from '../../../(entry)/join/_shared/offline';
import { getMessages } from '../../../../messages';
import { resolveLocale } from '../../../../lib/i18n/locale';
import { getStaffResetDependencies } from './deps';
import { resetStaffCredentialAction } from '../actions';
import { ResetForm } from './reset-form';

/** The one outcome a reset left behind for this render. */
export type CredentialsOutcome =
  | { readonly kind: 'applied'; readonly ended: number }
  | { readonly kind: 'self' }
  | { readonly kind: 'error' }
  | null;

export interface StaffCredentialsPanelProps {
  readonly caller: IdentityCaller;
  readonly outcome: CredentialsOutcome;
}

/** The panel, reading its own list through the credential reset port. */
export async function StaffCredentialsPanel({ caller, outcome }: StaffCredentialsPanelProps) {
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.staff.admin.credentials;
  const { reset } = await getStaffResetDependencies();
  const targets = await readStaffResetTargets(caller, { reset });

  return (
    <section
      id="staff-credentials"
      aria-labelledby="credentials-heading"
      className="flex scroll-mt-xl flex-col gap-md border-t border-border pt-lg"
    >
      <div className="flex flex-col gap-xs">
        <h2 id="credentials-heading" className="font-display text-h2 text-text-primary">
          {messages.staff.admin.credentialsHeading}
        </h2>
        <p className="max-w-prose text-body text-text-secondary">
          {messages.staff.admin.credentialsBody}
        </p>
      </div>

      {outcome?.kind === 'applied' ? (
        <Notice role="status" tone="success">
          {copy.applied.replace('{count}', String(outcome.ended))}
        </Notice>
      ) : null}
      {outcome?.kind === 'self' ? (
        <Notice role="alert" tone="error">
          {copy.self}
        </Notice>
      ) : null}

      <OfflineNote message={copy.offline} />

      {!targets.ok ? (
        <div className="flex flex-col gap-sm">
          <Notice role="alert" tone="error" title={copy.errorHeading}>
            {copy.errorBody}
          </Notice>
          <a
            href="/admin#staff-credentials"
            className={`inline-flex min-h-button items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
          >
            {copy.retry}
          </a>
        </div>
      ) : targets.targets.length === 0 ? (
        <Notice role="status" tone="info">
          {copy.empty}
        </Notice>
      ) : (
        <>
          {outcome?.kind === 'error' ? (
            <Notice role="alert" tone="error" title={copy.errorHeading}>
              {copy.errorBody}
            </Notice>
          ) : null}
          <ResetForm
            action={resetStaffCredentialAction}
            copy={{
              choose: copy.choose,
              newPassword: copy.newPassword,
              newPasswordHint: copy.newPasswordHint,
              reason: copy.reason,
              reasonHint: copy.reasonHint,
              reset: copy.reset,
              resetting: copy.resetting,
              offline: copy.offline,
              confirmHeading: copy.confirmHeading,
              confirmBody: copy.confirmBody,
              confirm: copy.confirm,
              cancel: copy.cancel,
            }}
            offlineLabel={copy.offline}
            targets={targets.targets.map((target) => ({
              id: target.staffUserId,
              fullName: target.fullName,
              roleLabel: messages.staff.admin.roles[target.role],
              activeLabel: target.active ? copy.active : copy.inactive,
              factorLabel: target.secondFactorEnrolled ? copy.enrolled : copy.notEnrolled,
            }))}
          />
        </>
      )}
    </section>
  );
}
