/**
 * Suggesting candidate wards from a resident's own words (`C-010`, `FEAT-002`, `NFR-014`).
 *
 * This is the deterministic path only. The `ward_candidate` capability (`C-080`) is not wired in
 * this task, so the answer always carries `capabilityStatus: "fallback"` and candidates drawn from
 * alias and exact matching. Nothing here assigns a ward, writes to the reference, or blocks the
 * resident: an empty list is a normal answer and the resident can send the description for review.
 */
import {
  wardFailure,
  type Ward,
  type WardCaller,
  type WardCandidate,
  type WardFailure,
  type WardFieldReason,
} from '../entities.ts';
import {
  matchWardCandidates,
  readDescription,
  readLocalGovernmentArea,
} from '../policies.ts';
import type { WardPorts } from '../ports.ts';
import { emitWardAnalytics } from './support.ts';

/** Which path produced the candidates. The model path is absent, so this is fixed for now. */
export type WardCandidateCapabilityStatus = 'on' | 'fallback';

/** The `C-010` request. */
export interface SuggestWardCandidatesInput {
  readonly description: string;
  readonly localGovernmentArea?: string;
}

/** The `C-010` answer, or the refusal that stopped it. */
export type SuggestWardCandidatesResult =
  | {
      readonly ok: true;
      readonly candidates: readonly WardCandidate[];
      readonly capabilityStatus: WardCandidateCapabilityStatus;
      /** The client must render the list for an explicit choice; a single match is not a decision. */
      readonly confirmationRequired: true;
    }
  | WardFailure;

/**
 * Suggests up to three candidate wards.
 *
 * @param caller - The caller; `C-010` requires a member session.
 * @param deps - The ward reference, analytics, clock and identifier ports (the last three are used
 *   only if the event is emitted; the candidate read itself needs none of them).
 * @param input - The resident's description and the local government area they selected.
 */
export async function suggestWardCandidates(
  caller: WardCaller,
  deps: Pick<WardPorts, 'wards' | 'analytics'>,
  input: SuggestWardCandidatesInput,
): Promise<SuggestWardCandidatesResult> {
  if (caller.kind === 'public') {
    return wardFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Ward candidates are offered inside a member session.',
    );
  }
  if (caller.kind !== 'member') {
    return wardFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'Ward candidates are offered to the member whose area is being described.',
    );
  }

  const description = readDescription(input.description);
  const area = readLocalGovernmentArea(input.localGovernmentArea);
  if (!description.ok || !area.ok) {
    const fields: Record<string, WardFieldReason> = {
      ...(description.ok ? {} : description.fields),
      ...(area.ok ? {} : area.fields),
    };
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_DESCRIPTION_INVALID',
      'The description needs some words, and no more than the field allows.',
      fields,
    );
  }

  let reference: readonly Ward[];
  try {
    reference = await deps.wards.listForMatching();
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'WARD_REFERENCE_UNAVAILABLE',
      'The ward list could not be read; the description can still be sent for review.',
    );
  }

  const matched = matchWardCandidates(reference, {
    description: description.value,
    ...(area.value === '' ? {} : { localGovernmentArea: area.value }),
  });

  if (matched.localGovernmentAreaRequired) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_AREA_REQUIRED',
      'More than one ward carries that name, so choose the local government area first.',
      { localGovernmentArea: 'REQUIRED' },
    );
  }

  await emitWardAnalytics(deps, [
    {
      name: 'ward_candidate_suggested',
      properties: { candidate_count: matched.candidates.length, source: 'fallback' },
    },
  ]);

  return {
    ok: true,
    candidates: matched.candidates,
    capabilityStatus: 'fallback',
    confirmationRequired: true,
  };
}
