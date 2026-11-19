/**
 * Confirming a ward, or sending the description for review (`C-011`, `FEAT-002`).
 *
 * Two outcomes, and neither blocks the resident:
 *
 * - a confirmed candidate writes `Member.wardId` and `Member.wardStatus: resolved`, keeps the
 *   resident's wording as an alias of the ward, and records the confirmation;
 * - "none of these" - or a reference that cannot be read - writes a `queued` WardDescriptionReview
 *   and leaves the account usable with `wardStatus: unresolved`.
 *
 * The action never moves an existing submission: a member who changes ward later keeps the ward each
 * submission was recorded against (`FEAT-002` edge cases).
 */
import {
  wardFailure,
  type Ward,
  type WardCaller,
  type WardDescriptionReview,
  type WardFailure,
  type WardFieldReason,
} from '../entities.ts';
import { normaliseWardText, readDescription, readLocalGovernmentArea } from '../policies.ts';
import type { WardPorts } from '../ports.ts';
import { appendWardAudit, emitWardAnalytics } from './support.ts';

/** The `C-011` request. `confirmedWardId: null` with `noneOfThese: true` is the queue branch. */
export interface ConfirmWardInput {
  readonly memberId: string;
  readonly description: string;
  readonly localGovernmentArea?: string;
  readonly confirmedWardId?: string | null;
  /** 1-based position of the confirmed candidate, for `EVT-007`. Defaults to 1. */
  readonly confirmedRank?: number;
  readonly noneOfThese?: boolean;
}

/** The member summary the confirmation returns. */
export interface ConfirmedMember {
  readonly id: string;
  readonly wardId?: string;
  readonly wardStatus: 'resolved' | 'unresolved';
}

/** The `C-011` answer, or the refusal that stopped the write. */
export type ConfirmWardResult =
  | {
      readonly ok: true;
      readonly member: ConfirmedMember;
      readonly wardDescriptionReview: {
        readonly id: string;
        readonly status: 'queued';
        readonly createdAt: string;
      } | null;
      readonly nextScreen: '/';
    }
  | WardFailure;

/**
 * Applies one ward confirmation.
 *
 * Every port in `deps` is expected to be bound to the same transaction by the composition root, so a
 * failed audit append leaves neither the member nor the review changed (`NFR-028`).
 *
 * @param caller - The caller; `C-011` requires the session's own member.
 * @param deps - The ward, member, review, audit, analytics, clock and identifier ports.
 * @param input - The resident's words, the candidate they chose, or "none of these".
 */
export async function confirmWard(
  caller: WardCaller,
  deps: WardPorts,
  input: ConfirmWardInput,
): Promise<ConfirmWardResult> {
  if (caller.kind === 'public') {
    return wardFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Confirming a ward needs a member session.',
    );
  }
  if (caller.kind !== 'member') {
    return wardFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'Only the member whose area this is can confirm their ward.',
    );
  }
  if (typeof input.memberId !== 'string' || input.memberId === '') {
    return wardFailure('VALIDATION_FAILED', 'MEMBER_ID_REQUIRED', 'The request names no member.', {
      memberId: 'REQUIRED',
    });
  }
  // A member may only change their own record, whichever identifier the payload carries.
  if (input.memberId !== caller.memberId) {
    return wardFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_MISMATCH',
      'A member can only confirm the ward on their own account.',
    );
  }

  const description = readDescription(input.description);
  const area = readLocalGovernmentArea(input.localGovernmentArea);
  const fields: Record<string, WardFieldReason> = {
    ...(description.ok ? {} : description.fields),
    ...(area.ok ? {} : area.fields),
  };
  if (
    input.confirmedWardId !== undefined &&
    input.confirmedWardId !== null &&
    (typeof input.confirmedWardId !== 'string' || input.confirmedWardId === '')
  ) {
    fields['confirmedWardId'] = 'PATTERN_MISMATCH';
  }
  if (
    input.confirmedRank !== undefined &&
    (typeof input.confirmedRank !== 'number' ||
      !Number.isInteger(input.confirmedRank) ||
      input.confirmedRank < 1)
  ) {
    fields['confirmedRank'] = 'OUT_OF_BAND';
  }
  if (input.noneOfThese !== undefined && typeof input.noneOfThese !== 'boolean') {
    fields['noneOfThese'] = 'PATTERN_MISMATCH';
  }
  if (Object.keys(fields).length > 0) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_CONFIRMATION_INVALID',
      'The confirmation needs the resident’s own words and a clear choice.',
      fields,
    );
  }
  if (!description.ok || !area.ok) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_CONFIRMATION_INVALID',
      'The confirmation needs the resident’s own words and a clear choice.',
    );
  }

  const member = await readMember(deps, caller.memberId);
  if (member === 'degraded') {
    return wardFailure(
      'SERVICE_DEGRADED',
      'MEMBER_RECORD_UNAVAILABLE',
      'The account could not be read, so the ward was not changed.',
    );
  }
  if (member === null) {
    return wardFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account does not exist.');
  }

  const confirmedWardId = input.confirmedWardId ?? null;
  if (confirmedWardId !== null) {
    let ward: Ward | null;
    try {
      ward = await deps.wards.getById(confirmedWardId);
    } catch {
      // `C-011`: when the reference cannot be read the free-text description is still accepted and
      // queued, so the resident is not sent away because a lookup failed.
      return queueDescription(deps, caller, description.value, area.value);
    }
    if (ward === null) {
      return wardFailure(
        'NOT_FOUND',
        'WARD_NOT_FOUND',
        'That ward is not in the platform’s reference.',
        { confirmedWardId: 'NOT_FOUND' },
      );
    }

    await deps.members.recordWard(member.id, ward.id);

    // The resident's wording is the evidence, so it accumulates into the reference (`FEAT-002`).
    const alreadyKnown =
      normaliseWardText(ward.name) === normaliseWardText(description.value) ||
      ward.aliases.some(
        (alias) => normaliseWardText(alias) === normaliseWardText(description.value),
      );
    if (!alreadyKnown) {
      await deps.wards.appendAlias({ wardId: ward.id, alias: description.value });
    }

    const occurredAt = deps.clock
      .now()
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');
    const refused = await appendWardAudit(deps, {
      actorId: caller.memberId,
      actorRole: 'member',
      action: 'ward.resolved',
      entityType: 'Member',
      entityId: member.id,
      occurredAt,
      ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
    });
    if (refused !== null) return refused;

    await emitWardAnalytics(deps, [
      {
        name: 'ward_confirmed',
        properties: {
          ward_id: ward.id,
          candidate_rank: input.confirmedRank ?? 1,
          // The candidates came from the deterministic fallback; `C-080`'s model path is not wired.
          source: 'fallback',
        },
      },
    ]);

    return {
      ok: true,
      member: { id: member.id, wardId: ward.id, wardStatus: 'resolved' },
      wardDescriptionReview: null,
      nextScreen: '/',
    };
  }

  if (input.noneOfThese !== true) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_CHOICE_REQUIRED',
      'Confirm a candidate, or say that none of them is the right ward.',
      { confirmedWardId: 'REQUIRED' },
    );
  }

  return queueDescription(deps, caller, description.value, area.value);
}

/**
 * Writes the queued description and answers with the unresolved member.
 *
 * A member whose ward is already recorded keeps it: sending a second description for review is not a
 * withdrawal of the ward that is already on the record, and their submissions keep the ward they
 * were recorded against.
 */
async function queueDescription(
  deps: WardPorts,
  caller: Extract<WardCaller, { kind: 'member' }>,
  description: string,
  localGovernmentArea: string,
): Promise<ConfirmWardResult> {
  const member = await readMember(deps, caller.memberId);
  if (member === 'degraded') {
    return wardFailure(
      'SERVICE_DEGRADED',
      'MEMBER_RECORD_UNAVAILABLE',
      'The account could not be read, so nothing was queued.',
    );
  }
  if (member === null) {
    return wardFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account does not exist.');
  }

  const createdAt = deps.clock
    .now()
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z');
  const review: WardDescriptionReview = {
    id: deps.identifiers.next('wdr'),
    memberId: member.id,
    description,
    ...(localGovernmentArea === '' ? {} : { localGovernmentArea }),
    status: 'queued',
    createdAt,
  };
  await deps.wardDescriptionReviews.create(review);

  const refused = await appendWardAudit(deps, {
    actorId: caller.memberId,
    actorRole: 'member',
    action: 'ward.sent_for_review',
    entityType: 'WardDescriptionReview',
    entityId: review.id,
    occurredAt: createdAt,
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  await emitWardAnalytics(deps, [
    {
      name: 'ward_sent_for_review',
      properties: { lga_matched: await localGovernmentAreaMatches(deps, localGovernmentArea) },
    },
  ]);

  return {
    ok: true,
    member:
      member.wardStatus === 'resolved' && member.wardId !== undefined
        ? { id: member.id, wardId: member.wardId, wardStatus: 'resolved' }
        : { id: member.id, wardStatus: 'unresolved' },
    wardDescriptionReview: { id: review.id, status: 'queued', createdAt },
    nextScreen: '/',
  };
}

/** Reads the member, distinguishing "no such row" from "the store did not answer". */
async function readMember(
  deps: WardPorts,
  memberId: string,
): Promise<Awaited<ReturnType<WardPorts['members']['get']>> | 'degraded'> {
  try {
    return await deps.members.get(memberId);
  } catch {
    return 'degraded';
  }
}

/**
 * Whether the selected local government area exists in the reference, for `EVT-008`'s
 * `lga_matched`. A reference that cannot be read answers `false`: the event records what the
 * platform could confirm, not what the resident typed.
 */
async function localGovernmentAreaMatches(
  deps: WardPorts,
  localGovernmentArea: string,
): Promise<boolean> {
  if (localGovernmentArea === '') return false;
  const wanted = normaliseWardText(localGovernmentArea);
  try {
    const wards = await deps.wards.listForMatching();
    return wards.some((ward) => normaliseWardText(ward.localGovernmentArea) === wanted);
  } catch {
    return false;
  }
}
