'use client';

/**
 * The staff sign-in form (`screens/24-staff-sign-in.md`).
 *
 * The client boundary exists for the states a server render cannot carry: the submit indicator with
 * both fields locked, and the offline banner. With scripting disabled the form posts as a plain
 * request to the `C-092` server action; the username survives a refusal and the password never does.
 */
import { useFormStatus } from 'react-dom';
import { FlowField } from '../../../../(entry)/join/_shared/field';
import { GuardedSubmit, OfflineNote } from '../../../../(entry)/join/_shared/offline';
import { useOffline } from '../../../../(entry)/join/_shared/use-offline';

export interface StaffSignInFormCopy {
  readonly username: { label: string; hint: string; error?: string | undefined };
  readonly password: { label: string; hint: string; error?: string | undefined };
  readonly submit: string;
  readonly submitting: string;
  readonly offline: string;
  readonly offlineSubmit: string;
}

function StaffSignInBody({
  copy,
  defaultUsername,
}: {
  copy: StaffSignInFormCopy;
  defaultUsername?: string | undefined;
}) {
  const offline = useOffline();
  const { pending } = useFormStatus();
  const locked = offline || pending;
  return (
    <>
      {offline ? <OfflineNote message={copy.offline} /> : null}
      <fieldset disabled={locked} className="flex flex-col gap-md border-0 p-0">
        <FlowField
          id="staff-username"
          label={copy.username.label}
          hint={copy.username.hint}
          error={copy.username.error}
          input={{
            name: 'username',
            type: 'text',
            autoComplete: 'username',
            autoCapitalize: 'none',
            spellCheck: false,
            required: true,
            ...(defaultUsername === undefined ? {} : { defaultValue: defaultUsername }),
          }}
        />
        <FlowField
          id="staff-password"
          label={copy.password.label}
          hint={copy.password.hint}
          error={copy.password.error}
          input={{
            name: 'password',
            type: 'password',
            autoComplete: 'current-password',
            required: true,
          }}
        />
      </fieldset>
      <div className="mt-lg">
        <GuardedSubmit
          variant="primary"
          className="w-full"
          label={copy.submit}
          sendingLabel={copy.submitting}
          offlineLabel={copy.offlineSubmit}
        />
      </div>
    </>
  );
}

export function StaffSignInForm({
  action,
  copy,
  defaultUsername,
}: {
  action: (formData: FormData) => void | Promise<void>;
  copy: StaffSignInFormCopy;
  defaultUsername?: string | undefined;
}) {
  return (
    <form action={action}>
      <StaffSignInBody copy={copy} defaultUsername={defaultUsername} />
    </form>
  );
}
