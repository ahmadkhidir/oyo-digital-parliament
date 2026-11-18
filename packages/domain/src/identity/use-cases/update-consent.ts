/**
 * Granting or withdrawing one optional consent (`C-034`, `FEAT-012`, `EVT-046`).
 *
 * One purpose per call, taking effect immediately and never inferred. A withdrawal is recorded on the
 * active record rather than deleting it, and a later grant is a new record, so the member's own history
 * shows what was agreed and when.
 */
import {
  identityFailure,
  type Consent,
  type ConsentPurpose,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type MemberRecord,
} from '../entities.ts';
import { readBoolean, readConsentPurpose, toIsoSeconds } from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import { appendIdentityAudit, emitIdentityAnalytics } from './support.ts';

/** The `C-034` request. */
export interface UpdateConsentInput {
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
}

/** The `C-034` answer, or the refusal that stopped it. */
export type UpdateConsentResult =
  | {
      readonly ok: true;
      readonly consent: {
        readonly id: string;
        readonly memberId: string;
        readonly purpose: ConsentPurpose;
        readonly granted: boolean;
        readonly recordedAt: string;
        readonly withdrawnAt: string | null;
      };
      readonly effectiveImmediately: true;
    }
  | IdentityFailure;

/**
 * Applies one consent change.
 *
 * @param caller - The member whose consent this is.
 * @param deps - The consent, member, audit, analytics and clock ports.
 * @param input - The single purpose and whether it is now granted.
 */
export async function updateConsent(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: UpdateConsentInput,
): Promise<UpdateConsentResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Sign in to change your consents.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'A staff session cannot change a member’s consent.',
    );
  }

  const purpose = readConsentPurpose(input.purpose);
  const granted = readBoolean(input.granted, 'granted');
  const fields: Record<string, IdentityFieldReason> = {};
  if (!purpose.ok) fields[purpose.field] = purpose.reason;
  if (!granted.ok) fields[granted.field] = granted.reason;
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'CONSENT_UPDATE_INVALID',
      'The consent change could not be read.',
      fields,
    );
  }
  if (!purpose.ok || !granted.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'CONSENT_UPDATE_INVALID',
      'The consent change could not be read.',
    );
  }

  let member: MemberRecord | null;
  try {
    member = await deps.members.get(caller.memberId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your consents could not be read, so nothing was changed.',
    );
  }
  if (member === null || member.deletedAt !== undefined) {
    return identityFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account is no longer available.');
  }

  const now = toIsoSeconds(deps.clock.now());
  let latest: Consent | null;
  try {
    latest = await deps.consents.latestForPurpose(member.id, purpose.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your consents could not be read, so nothing was changed.',
    );
  }

  if (latest !== null && latest.granted === granted.value) {
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'CONSENT_ALREADY_IN_STATE',
      granted.value ? 'That consent is already in force.' : 'That consent is already withdrawn.',
    );
  }
  if (!granted.value && (latest === null || !latest.granted)) {
    return identityFailure(
      'CONFLICT_ALREADY_DECIDED',
      'CONSENT_ALREADY_IN_STATE',
      'That consent is not in force, so there is nothing to withdraw.',
    );
  }

  let consent: Consent | undefined;
  try {
    if (granted.value) {
      consent = {
        id: deps.identifiers.next('cns'),
        memberId: member.id,
        purpose: purpose.value,
        granted: true,
        recordedAt: now,
      };
      await deps.consents.create(consent);
    } else if (latest !== null) {
      await deps.consents.withdraw(latest.id, now);
      consent = {
        id: latest.id,
        memberId: latest.memberId,
        purpose: latest.purpose,
        granted: false,
        recordedAt: latest.recordedAt,
        withdrawnAt: now,
      };
    }
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your consent could not be saved. Try again in a moment.',
    );
  }
  if (consent === undefined) {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your consent could not be saved. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: member.id,
    actorRole: 'member',
    action: 'consent.changed',
    entityType: 'Consent',
    entityId: consent.id,
    reason: granted.value ? 'GRANTED' : 'WITHDRAWN',
    occurredAt: now,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  await emitIdentityAnalytics(deps, [
    {
      name: 'consent_changed',
      properties: { purpose: purpose.value, granted: granted.value },
    },
  ]);

  return {
    ok: true,
    consent: {
      id: consent.id,
      memberId: consent.memberId,
      purpose: consent.purpose,
      granted: consent.granted,
      recordedAt: consent.recordedAt,
      withdrawnAt: consent.withdrawnAt ?? null,
    },
    effectiveImmediately: true,
  };
}
