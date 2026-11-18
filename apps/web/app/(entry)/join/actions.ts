'use server';

/**
 * The registration action (`C-002`, `screens/03-registration-form.md`).
 *
 * One exported action per contract entry: this form posts to `registerResident`, and nothing
 * else. The browser's part of validation is advisory — the payload is re-checked here at the
 * boundary (`apps/web/AGENTS.md` Discipline), with the same readers the domain uses, so a field
 * failure always names the control that produced it.
 *
 * The action answers by redirecting. A failure (validation, rate limit, degraded service) writes
 * the submitted values and the reasons into the flow's retry cookie and returns to `/join`, which
 * is how the typed text survives without scripting; a success writes the pending-registration
 * pointer and moves to `/join/confirm` — or stays here, with the delivery-failed state, when the
 * SMS gateway held the first dispatch (`C-002` 201 with `codeDelivery.status:"delayed"`).
 */
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  readDeclaredAge,
  readDisplayName,
  readFullName,
  readTelephone,
  registerResident,
  type IdentityFailure,
  type IdentityPorts,
} from '@odp/domain';
import { newCorrelationId } from '../../../lib/logging';
import { resolveLocale } from '../../../lib/i18n/locale';
import { getIdentityDependencies } from '../../../lib/identity/ports';
import {
  clearJoinPending,
  clearJoinRetry,
  writeJoinPending,
  writeJoinRetry,
  type JoinFormValues,
  type JoinStatus,
} from '../../../lib/identity/join-cookies';

/** Reads the four facts off the wire, as the visitor typed them. */
function readForm(formData: FormData): JoinFormValues {
  const value = (key: string): string => {
    const raw = formData.get(key);
    return typeof raw === 'string' ? raw : '';
  };
  return {
    fullName: value('fullName'),
    declaredAge: value('declaredAge'),
    telephoneNumber: value('telephoneNumber'),
    displayName: value('displayName'),
  };
}

/** Narrows one domain reading into the pair the field-error map holds. */
function mapReading(
  field: string,
  reading: { readonly ok: true } | { readonly ok: false; readonly reason: string },
): { field: string; ok: boolean; reason?: string } {
  return reading.ok ? { field, ok: true } : { field, ok: false, reason: reading.reason };
}

/**
 * The boundary's own field check.
 *
 * The domain re-reads every value inside `registerResident`; this pre-check exists so the action
 * never sends a payload it already knows is invalid. The readers are the domain's own, so the
 * boundary and the use case cannot disagree about a rule.
 */
function validateFields(values: JoinFormValues): Record<string, string> {
  const fields: Record<string, string> = {};
  const readings = [
    mapReading('fullName', readFullName(values.fullName)),
    mapReading('declaredAge', readDeclaredAge(values.declaredAge)),
    mapReading('telephoneNumber', readTelephone(values.telephoneNumber)),
    mapReading('displayName', readDisplayName(values.displayName, { required: false })),
  ];
  for (const reading of readings) {
    if (!reading.ok) fields[reading.field] = reading.reason ?? 'REQUIRED';
  }
  return fields;
}

/** The source address the limiter counts against, never logged and never stored raw (`NFR-027`). */
async function requestAddress(): Promise<string> {
  const store = await headers();
  const forwarded = store.get('x-forwarded-for');
  if (forwarded !== null) {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  // An absent header still needs a subject so the limiter can count; the adapter digests it.
  return 'unknown';
}

/** One limiter consult that keeps a store failure apart from a refusal, as the domain does. */
async function consultAddressCap(
  ports: IdentityPorts,
  address: string,
): Promise<
  | { readonly refused: false }
  | { readonly refused: true; readonly retryAfterSeconds: number | null }
> {
  try {
    const outcome = await ports.rateLimits.consume({
      bucket: 'registration_address',
      subject: { kind: 'address', value: address },
    });
    return outcome.allowed
      ? { refused: false }
      : { refused: true, retryAfterSeconds: outcome.retryAfterSeconds };
  } catch {
    // A limiter that cannot answer is a degraded service, not an admission (`NFR-027`).
    return { refused: true, retryAfterSeconds: null };
  }
}

/** Builds the domain input, with `displayName` omitted when the field was left blank (`C-002`). */
function toInput(values: JoinFormValues) {
  return {
    fullName: values.fullName,
    declaredAge: values.declaredAge,
    telephoneNumber: values.telephoneNumber,
    ...(values.displayName === '' ? {} : { displayName: values.displayName }),
  };
}

/**
 * Persists a refused attempt for the next render.
 *
 * The reason grain is the screen state the visitor needs: field reasons when a field failed, and
 * one status token when the whole attempt was refused. `retryAfterSeconds` rides along where the
 * contract carries it (`C-001` `RATE_LIMITED`).
 */
async function holdAttempt(
  values: JoinFormValues,
  refusal: {
    readonly fields?: Readonly<Record<string, string>>;
    readonly status?: JoinStatus;
    readonly retryAfterSeconds?: number;
  },
): Promise<void> {
  await writeJoinRetry({
    values,
    fields: refusal.fields ?? {},
    ...(refusal.status === undefined ? {} : { status: refusal.status }),
    ...(refusal.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: refusal.retryAfterSeconds }),
  });
}

/**
 * Maps a `C-002` refusal onto the state grain the screen renders.
 *
 * Field reasons ride into the field-error map so each failing field is named; the whole-attempt
 * refusals become the status tokens the catalogue has sentences for. An already-registered number
 * carries its field reason (`telephoneNumber:"ALREADY_SET"`) and points at sign-in through the
 * state it sets; the render pairs them.
 */
function refusalOf(failure: IdentityFailure): {
  readonly fields: Readonly<Record<string, string>>;
  readonly status?: JoinStatus;
  readonly retryAfterSeconds?: number;
} {
  if (failure.cause === 'ALREADY_REGISTERED') {
    return { fields: failure.fields, status: 'ALREADY_REGISTERED' };
  }
  if (failure.code === 'RATE_LIMITED') {
    return {
      fields: failure.fields,
      status: 'RATE_LIMITED',
      ...(failure.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: failure.retryAfterSeconds }),
    };
  }
  // `REGISTRATION_INVALID` and every `SERVICE_DEGRADED` cause: nothing was created, the form is
  // intact. `REGISTRATION_RATE_LIMITED`'s limiter failure reaches here too, as a degraded answer.
  return { fields: failure.fields, status: 'DEGRADED' };
}

/**
 * Registers one resident and requests the code.
 *
 * The form posts here with or without scripting; every exit is a redirect, so the no-scripting
 * path answers exactly as the enhanced one does.
 */
export async function registerResidentAction(formData: FormData): Promise<void> {
  const values = readForm(formData);
  const { ports } = await getIdentityDependencies();
  const correlationId = newCorrelationId();

  // `C-002`: a cap is per number and per source address. The domain consults the number bucket
  // inside the use case; the address bucket is this boundary's to consult, because only the
  // transport knows the address.
  const address = await consultAddressCap(ports, await requestAddress());
  if (address.refused) {
    await holdAttempt(values, {
      status: 'RATE_LIMITED',
      ...(address.retryAfterSeconds === null
        ? {}
        : { retryAfterSeconds: address.retryAfterSeconds }),
    });
    redirect('/join');
  }

  const fieldFailures = validateFields(values);
  if (Object.keys(fieldFailures).length > 0) {
    await holdAttempt(values, { fields: fieldFailures });
    redirect('/join');
  }

  const result = await registerResident(
    { kind: 'public', locale: await resolveLocale(), correlationId },
    ports,
    toInput(values),
  );

  if (!result.ok) {
    await holdAttempt(values, refusalOf(result));
    redirect('/join');
  }

  // The pending registration exists and the code has been dispatched (or held): the visitor's
  // place in the flow is now this record, whatever screen they land on next.
  await clearJoinRetry();
  await clearJoinPending();
  await writeJoinPending({
    id: result.pendingRegistrationId,
    delayed: result.codeDelivery.status === 'delayed',
  });

  if (result.codeDelivery.status === 'delayed') {
    // `C-002` 201 with a held dispatch: the pending registration is kept and no code left. The
    // delivery-failed state renders here, where the form is still on screen, and the continue
    // action offers the resend the confirmation screen owns.
    redirect('/join');
  }
  redirect(result.nextScreen);
}
