/**
 * Registering a resident (`C-002`, `FEAT-001`, `NFR-004`, `NFR-020`, `NFR-027`, `EVT-042`, `C-076`).
 *
 * Stores a PendingRegistration and hands one one-time code to the notification boundary, which queues
 * it, attempts it and holds it when the SMS channel is unavailable. No Member exists, no session opens
 * and nothing is published until a code is accepted: the pending record is the whole of what this
 * action creates, and it is discarded after twenty-four hours if the code is never proved.
 */
import {
  identityFailure,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type Locale,
  type MemberRecord,
  type PendingRegistration,
} from '../entities.ts';
import {
  generateDisplayName,
  disambiguateDisplayName,
  pendingRegistrationExpiry,
  readDeclaredAge,
  readDisplayName,
  readFullName,
  readLocale,
  readTelephone,
  resendAvailableAt,
  toIsoSeconds,
  type Reading,
} from '../policies.ts';
import type { CodeDelivery, IdentityPorts } from '../ports.ts';
import { consumeRateLimit, emitIdentityAnalytics } from './support.ts';

/** The `C-002` request. `displayName` may be omitted and is then generated. */
export interface RegisterResidentInput {
  readonly fullName: string;
  readonly declaredAge: number | string;
  readonly telephoneNumber: string;
  readonly displayName?: string;
  readonly locale?: Locale;
}

/** The `C-002` answer, or the refusal that stopped it. */
export type RegisterResidentResult =
  | {
      readonly ok: true;
      readonly pendingRegistrationId: string;
      readonly telephoneNumber: string;
      readonly expiresAt: string;
      readonly codeSentAt: string;
      readonly codeDelivery: {
        readonly status: 'sent' | 'delayed';
        readonly channel: 'sms';
        readonly resendAvailableAt: string;
      };
      readonly nextScreen: '/join/confirm';
    }
  | IdentityFailure;

/** Collects the frozen field reasons of every reading that failed. */
function fieldsOf(readings: readonly Reading<unknown>[]): Record<string, IdentityFieldReason> {
  const fields: Record<string, IdentityFieldReason> = {};
  for (const reading of readings) {
    if (!reading.ok) fields[reading.field] = reading.reason;
  }
  return fields;
}

/**
 * Registers one resident.
 *
 * @param caller - The visitor; a staff session may not register a resident.
 * @param deps - The pending-registration, code, member, limiter, audit and analytics ports.
 * @param input - The four facts the form collects.
 */
export async function registerResident(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: RegisterResidentInput,
): Promise<RegisterResidentResult> {
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'STAFF_SESSION_PRESENT',
      'A staff session cannot register a resident account.',
    );
  }

  const fullName = readFullName(input.fullName);
  const declaredAge = readDeclaredAge(input.declaredAge);
  const telephoneNumber = readTelephone(input.telephoneNumber);
  const displayName = readDisplayName(input.displayName, { required: false });
  const fields = fieldsOf([fullName, declaredAge, telephoneNumber, displayName]);

  // `C-002`: the locale comes from the visitor's session; a supplied value must still be a locale.
  let locale: Locale = caller.kind === 'public' ? (caller.locale ?? 'en-NG') : 'en-NG';
  if (input.locale !== undefined) {
    const reading = readLocale(input.locale);
    if (!reading.ok) fields[reading.field] = reading.reason;
    else locale = reading.value;
  }
  if (Object.keys(fields).length > 0) {
    return identityFailure(
      'VALIDATION_FAILED',
      'REGISTRATION_INVALID',
      'Check the highlighted fields and send the code again.',
      fields,
    );
  }
  if (!fullName.ok || !declaredAge.ok || !telephoneNumber.ok || !displayName.ok) {
    // Unreachable after the field merge above; it narrows the readings for the compiler.
    return identityFailure('VALIDATION_FAILED', 'REGISTRATION_INVALID', 'The form is incomplete.');
  }

  const limited = await consumeRateLimit(deps, {
    bucket: 'registration',
    subject: { kind: 'number', value: telephoneNumber.value },
  });
  if (!limited.ok) {
    return identityFailure(
      'SERVICE_DEGRADED',
      'RATE_LIMIT_UNAVAILABLE',
      'The request could not be checked. Try again in a moment.',
    );
  }
  if (!limited.allowed) {
    return identityFailure(
      'RATE_LIMITED',
      'REGISTRATION_RATE_LIMITED',
      'Too many registration attempts from this number. Try again shortly.',
      {},
      { retryAfterSeconds: limited.retryAfterSeconds },
    );
  }

  let existing: readonly MemberRecord[];
  try {
    existing = await deps.members.findByTelephone(telephoneNumber.value);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The account store could not be read, so nothing was created.',
    );
  }
  if (existing.length > 0) {
    // `C-002`: a number belongs to at most one account, so an already-registered number offers
    // recovery of that account rather than a second registration (`FEAT-001`).
    return identityFailure(
      'VALIDATION_FAILED',
      'ALREADY_REGISTERED',
      'That number already has an account. Sign in to it instead.',
      { telephoneNumber: 'ALREADY_SET' },
      { meta: { recoveryPath: '/sign-in' } },
    );
  }

  const createdAt = toIsoSeconds(deps.clock.now());
  const pendingRegistrationId = deps.identifiers.next('prg');

  // `FEAT-001`: a member who supplies no display name receives one, and may change it later.
  let publishedName = displayName.value;
  if (publishedName === '') {
    const base = generateDisplayName(fullName.value, pendingRegistrationId);
    publishedName = base;
    try {
      for (let attempt = 2; attempt <= 9; attempt += 1) {
        if (!(await deps.members.isDisplayNameTaken(publishedName))) break;
        publishedName = disambiguateDisplayName(base, attempt);
      }
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'IDENTITY_STORE_UNAVAILABLE',
        'The account store could not be read, so nothing was created.',
      );
    }
  } else {
    try {
      if (await deps.members.isDisplayNameTaken(publishedName)) {
        publishedName = disambiguateDisplayName(
          generateDisplayName(fullName.value, pendingRegistrationId),
          2,
        );
      }
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'IDENTITY_STORE_UNAVAILABLE',
        'The account store could not be read, so nothing was created.',
      );
    }
  }

  const pending: PendingRegistration = {
    id: pendingRegistrationId,
    telephoneNumber: telephoneNumber.value,
    fullName: fullName.value,
    displayName: publishedName,
    declaredAge: declaredAge.value,
    locale,
    codeSentAt: createdAt,
    expiresAt: pendingRegistrationExpiry(createdAt),
    createdAt,
  };

  try {
    await deps.pendingRegistrations.create(pending);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'The registration could not be saved, so nothing was created.',
    );
  }

  // `C-002`, `C-076`: the code leaves through the notification boundary, which queues it, attempts it
  // once now and holds it when the SMS channel is down. A hold is a delivery failure, not a lost
  // registration: the pending record stands and the answer is still 201 with `delayed`.
  let delivery: CodeDelivery = { status: 'delayed', channel: 'sms' };
  try {
    delivery = await deps.notifications.deliverCode({
      pendingRegistrationId: pending.id,
      locale,
      // `C-076`: the namespace names the fact the notice is about, and the body is opaque identifiers
      // and the issue instant — never a name, a number or a line of text.
      dedupeKey: `registration_code:${pending.id}:${createdAt}`,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
  } catch {
    delivery = { status: 'delayed', channel: 'sms' };
  }

  await emitIdentityAnalytics(deps, [
    {
      name: 'registration_started',
      properties: { locale },
      // `EVT-042`, `C-089`: there is no account yet, so the event is attributed to the pending
      // registration — the identifier the platform mints for this visitor's pre-account window and
      // expires with it. Nothing about the person travels with it.
      subject: { kind: 'anonymous', anonymousId: pending.id },
      locale,
    },
  ]);

  return {
    ok: true,
    pendingRegistrationId: pending.id,
    telephoneNumber: pending.telephoneNumber,
    expiresAt: pending.expiresAt,
    codeSentAt: createdAt,
    codeDelivery: {
      status: delivery.status,
      channel: 'sms',
      resendAvailableAt: resendAvailableAt(createdAt),
    },
    nextScreen: '/join/confirm',
  };
}
