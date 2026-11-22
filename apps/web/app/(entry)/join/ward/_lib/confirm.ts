/**
 * The `confirmWard` action's processing (`C-011`, `FEAT-002`).
 *
 * The Next-specific wrapper lives in `actions.ts`; this module holds what a unit test can run
 * without the framework: the form's shape re-validation at the boundary, the call into the domain,
 * and the mapping of every outcome onto a redirect target or a field reason. The resident's wording
 * never lands in a URL — a refusal re-renders the screen with the submitted values read back from a
 * server-side echo named by a digest of the idempotency key (`_lib/form-echo.ts`).
 */
import {
  WARD_DESCRIPTION_MAX_LENGTH,
  WARD_LOCAL_GOVERNMENT_AREA_MAX_LENGTH,
  type ConfirmWardInput,
  type ConfirmWardResult,
  type WardCaller,
  type WardFailure,
} from '@odp/domain';

/** The form's raw fields, exactly as `FormData` carries them. */
export interface ConfirmWardRawForm {
  readonly description: FormDataEntryValue | null;
  readonly localGovernmentArea: FormDataEntryValue | null;
  readonly confirmedWardId: FormDataEntryValue | null;
  readonly confirmedRank: FormDataEntryValue | null;
  readonly noneOfThese: FormDataEntryValue | null;
  readonly idempotencyKey: FormDataEntryValue | null;
}

/** Why the action re-rendered the screen instead of writing. */
export type ConfirmInvalidReason =
  | 'description_required'
  | 'description_long'
  | 'area_long'
  | 'choice_required'
  | 'ward_unknown'
  | 'idempotency_required'
  | 'idempotency_conflict'
  | 'write_failed';

/** The parsed form, ready for the domain. */
export interface ParsedConfirmWardForm {
  readonly description: string;
  readonly localGovernmentArea: string;
  readonly confirmedWardId: string | null;
  readonly confirmedRank: number | undefined;
  readonly noneOfThese: boolean;
  readonly idempotencyKey: string;
}

/** What the action does with one submission. */
export type ConfirmWardDecision =
  | { readonly kind: 'confirmed'; readonly redirectTo: '/' }
  | { readonly kind: 'queued'; readonly redirectTo: '/join/ward?sent=review' }
  | { readonly kind: 'signed-out'; readonly redirectTo: string }
  | {
      readonly kind: 'invalid';
      readonly reason: ConfirmInvalidReason;
      /** The digest naming the echo to read the submitted values from, when one exists. */
      readonly echoKey?: string;
    };

/** The idempotency scope this action claims under (`C-001`, ADR-002). */
export const CONFIRM_IDEMPOTENCY_SCOPE = 'ward.confirm';

/** The sign-in screen, carrying the place the member came from. */
export const SIGN_IN_PATH = '/sign-in?returnTo=%2Fjoin%2Fward';

/** A UUIDv4 identifier, the form's `C-001` idempotency key. */
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Re-validates the form's shape at the action boundary.
 *
 * The browser's validation is never trusted; the domain re-checks the field values themselves. What
 * this adds is the transport half: `FormData` values are untyped, the idempotency key must be
 * present and shaped before anything writes (`C-001`), and a forged extra field is dropped.
 *
 * @param raw - The submitted fields.
 * @returns The parsed form, or the reason the request is unusable.
 */
export function parseConfirmWardForm(
  raw: ConfirmWardRawForm,
): ParsedConfirmWardForm | { readonly reason: ConfirmInvalidReason } {
  if (typeof raw.idempotencyKey !== 'string' || !UUID_V4.test(raw.idempotencyKey)) {
    return { reason: 'idempotency_required' };
  }

  const description = typeof raw.description === 'string' ? raw.description.trim() : '';
  if (description === '') return { reason: 'description_required' };
  if (description.length > WARD_DESCRIPTION_MAX_LENGTH) return { reason: 'description_long' };

  const area = typeof raw.localGovernmentArea === 'string' ? raw.localGovernmentArea.trim() : '';
  if (area.length > WARD_LOCAL_GOVERNMENT_AREA_MAX_LENGTH) return { reason: 'area_long' };

  const confirmedWardId =
    typeof raw.confirmedWardId === 'string' && raw.confirmedWardId !== ''
      ? raw.confirmedWardId
      : null;

  let confirmedRank: number | undefined;
  if (typeof raw.confirmedRank === 'string' && raw.confirmedRank !== '') {
    const rank = Number.parseInt(raw.confirmedRank, 10);
    if (Number.isInteger(rank) && rank >= 1) confirmedRank = rank;
  }

  // "None of these" wins over a radio the resident had selected before pressing it: the request is
  // a queue, and sending a candidate alongside it would record a ward the resident just rejected
  // (`C-011` request, `screens/05` None of these).
  const noneOfThese = raw.noneOfThese === '1';
  return {
    description,
    localGovernmentArea: area,
    confirmedWardId: noneOfThese ? null : confirmedWardId,
    confirmedRank: noneOfThese ? undefined : confirmedRank,
    noneOfThese,
    idempotencyKey: raw.idempotencyKey,
  };
}

/** The domain runner this screen's production wiring provides; a test provides its own. */
export interface ConfirmWardRunner {
  run(
    caller: WardCaller,
    input: ConfirmWardInput,
    options: { readonly idempotencyKey: string },
  ): Promise<ConfirmWardResult>;
}

/**
 * Runs one ward confirmation and maps the answer onto the action's decision.
 *
 * The mapping is total: every `C-011` refusal lands in one of the screen's declared states, and the
 * two successes carry the screen their `nextScreen` (`C-011` response, `screens/05`).
 *
 * @param runner - The transactional runner (production) or a fake (test).
 * @param caller - The session's member caller, or `null` when no member session was resolved.
 * @param parsed - The re-validated form.
 * @param echoKey - Digest of the idempotency key, attached to a re-render so the submitted wording
 *   can be read back from the server-side echo.
 */
export async function processConfirmWard(
  runner: ConfirmWardRunner,
  caller: WardCaller | null,
  parsed: ParsedConfirmWardForm,
  echoKey: string,
): Promise<ConfirmWardDecision> {
  if (caller === null || caller.kind !== 'member') {
    return { kind: 'signed-out', redirectTo: SIGN_IN_PATH };
  }

  const input: ConfirmWardInput = {
    memberId: caller.memberId,
    description: parsed.description,
    ...(parsed.localGovernmentArea === ''
      ? {}
      : { localGovernmentArea: parsed.localGovernmentArea }),
    ...(parsed.confirmedWardId === null ? {} : { confirmedWardId: parsed.confirmedWardId }),
    ...(parsed.confirmedRank === undefined ? {} : { confirmedRank: parsed.confirmedRank }),
    ...(parsed.noneOfThese ? { noneOfThese: true } : {}),
  };

  const result = await runner.run(caller, input, { idempotencyKey: parsed.idempotencyKey });
  if (result.ok) {
    return result.wardDescriptionReview === null
      ? { kind: 'confirmed', redirectTo: '/' }
      : { kind: 'queued', redirectTo: '/join/ward?sent=review' };
  }

  return { kind: 'invalid', reason: mapFailure(result), echoKey };
}

/**
 * Maps one domain refusal onto the screen's reason vocabulary.
 *
 * The contract's `fields` decide where the apology goes: a description or area refusal re-renders
 * with the field error, a missing choice names the choice, and the degraded paths (the reference or
 * the member store did not answer) fall back to the write-failed sentence while the resident's
 * wording stays available through the echo.
 */
function mapFailure(result: WardFailure): ConfirmInvalidReason {
  switch (result.code) {
    case 'VALIDATION_FAILED':
      return validationReason(result);
    case 'UNAUTHENTICATED':
    case 'FORBIDDEN_ROLE':
      // The session decides; a payload that names another member is refused, and the screen sends
      // the visitor back through the session rather than arguing about the form.
      return 'write_failed';
    case 'NOT_FOUND':
      return result.cause === 'WARD_NOT_FOUND' ? 'ward_unknown' : 'write_failed';
    default:
      // SERVICE_DEGRADED: the reference or the member store did not answer.
      return 'write_failed';
  }
}

/** Picks the field the validation failure belongs to, so the error lands on its control. */
function validationReason(result: WardFailure): ConfirmInvalidReason {
  const fields = result.fields;
  if (fields['description'] === 'REQUIRED') return 'description_required';
  if (fields['description'] !== undefined) return 'description_long';
  if (fields['localGovernmentArea'] === 'REQUIRED') return 'choice_required';
  if (fields['localGovernmentArea'] !== undefined) return 'area_long';
  if (fields['confirmedWardId'] !== undefined) {
    return result.cause === 'WARD_CHOICE_REQUIRED' ? 'choice_required' : 'ward_unknown';
  }
  return 'choice_required';
}
