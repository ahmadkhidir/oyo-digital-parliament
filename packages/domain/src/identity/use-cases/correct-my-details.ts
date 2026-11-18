/**
 * Correcting the caller's own details (`C-033`, `FEAT-012`, `NFR-040`).
 *
 * Rewrites the display name, the real name and the language on the caller's own row. It never rewrites
 * the public record: earlier submissions and comments keep the display name that was attributed when
 * they were written, and the answer reports how many of each did so.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type Locale,
  type MemberRecord,
} from '../entities.ts';
import {
  readDisplayName,
  readFullName,
  readLocale,
  toIsoSeconds,
  type Reading,
} from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import { appendIdentityAudit, consumeRateLimit } from './support.ts';

/** The `C-033` request. */
export interface CorrectMyDetailsInput {
  readonly displayName: string;
  readonly fullName: string;
  readonly locale: Locale;
}

/** The `C-033` answer, or the refusal that stopped it. */
export type CorrectMyDetailsResult =
  | {
      readonly ok: true;
      readonly member: {
        readonly id: string;
        readonly displayName: string;
        readonly fullName: string;
        readonly locale: Locale;
      };
      readonly previousDisplayNameRetainedOn: {
        readonly submissions: number;
        readonly comments: number;
      };
    }
  | IdentityFailure;

/**
 * Applies one correction to the caller's own member row.
 *
 * @param caller - The member whose details these are.
 * @param deps - The member, limiter and audit ports.
 * @param input - The three fields the correction may change.
 */
export async function correctMyDetails(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: CorrectMyDetailsInput,
): Promise<CorrectMyDetailsResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Sign in to correct your details.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'A staff session cannot correct a member’s details.',
    );
  }

  const displayName = readDisplayName(input.displayName, { required: true });
  const fullName = readFullName(input.fullName);
  const locale = readLocale(input.locale);
  const fields: Record<string, IdentityFieldReason> = {};
  for (const reading of [displayName, fullName, locale] as readonly Reading<unknown>[]) {
    if (!reading.ok) fields[reading.field] = reading.reason;
  }
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'PROFILE_CORRECTION_INVALID',
      'Check the highlighted fields and save again.',
      fields,
    );
  }
  if (!displayName.ok || !fullName.ok || !locale.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'PROFILE_CORRECTION_INVALID',
      'Check the highlighted fields and save again.',
    );
  }

  let member: MemberRecord | null;
  try {
    member = await deps.members.get(caller.memberId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your details could not be read, so nothing was changed.',
    );
  }
  if (member === null || member.deletedAt !== undefined) {
    return identityFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account is no longer available.');
  }

  // `C-033`: a name another member publishes needs disambiguation rather than a silent overwrite.
  try {
    if (await deps.members.isDisplayNameTaken(displayName.value, member.id)) {
      return identityFailure(
        'VALIDATION_FAILED',
        'DISPLAY_NAME_TAKEN',
        'Another member already publishes that display name. Try a version with a number or initial.',
        { displayName: 'ALREADY_SET' },
      );
    }
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your details could not be checked, so nothing was changed.',
    );
  }

  if (displayName.value !== member.displayName) {
    const limited = await consumeRateLimit(deps, {
      bucket: 'display_name_change',
      subject: { kind: 'member', value: member.id },
    });
    if (!limited.ok) {
      return identityFailure(
        'SERVICE_DEGRADED',
        'RATE_LIMIT_UNAVAILABLE',
        'The change could not be checked. Try again in a moment.',
      );
    }
    if (!limited.allowed) {
      return identityFailure(
        'RATE_LIMITED',
        'DISPLAY_NAME_CHANGE_LIMITED',
        'Your display name changed recently. Try again later.',
        {},
        { retryAfterSeconds: limited.retryAfterSeconds },
      );
    }
  }

  const displayNameChanged = displayName.value !== member.displayName;
  let retained: { readonly submissions: number; readonly comments: number };
  try {
    // Only a changed display name leaves earlier writing attributed to the previous one.
    retained = displayNameChanged
      ? await deps.members.countAuthoredContent(member.id)
      : { submissions: 0, comments: 0 };
    await deps.members.updateProfile(member.id, {
      displayName: displayName.value,
      fullName: fullName.value,
      locale: locale.value,
    });
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your details could not be saved. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: member.id,
    actorRole: 'member',
    action: 'member.profile_corrected',
    entityType: 'Member',
    entityId: member.id,
    occurredAt: toIsoSeconds(deps.clock.now()),
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  return {
    ok: true,
    member: {
      id: member.id,
      displayName: displayName.value,
      fullName: fullName.value,
      locale: locale.value,
    },
    previousDisplayNameRetainedOn: {
      submissions: retained.submissions,
      comments: retained.comments,
    },
  };
}
