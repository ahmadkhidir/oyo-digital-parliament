/**
 * The `ward_candidate` payload (`C-080`, `FEAT-002`).
 *
 * The resident's own words and the local government area they chose. Nothing else is sent: no name,
 * no telephone number, no member identifier, no ward list. The field limit is the one `C-010` and
 * `C-080` name, so the route and the capability refuse the same description at the same length.
 *
 * @module capabilities/ward_candidate/payload
 */
import type { AllowedValue } from '../../deidentification/deidentify.ts';
import type { PayloadRead } from '../definition.ts';

/** The maximum description length `C-010` and `C-080` fix. */
export const WARD_DESCRIPTION_MAX_LENGTH = 500;

/** The maximum candidates either contract permits. */
export const WARD_CANDIDATE_LIMIT_MAX = 3;

/** The local-government-area field's practical bound; no LGA name in the state approaches it. */
const LOCAL_GOVERNMENT_AREA_MAX_LENGTH = 120;

/** The de-identified `C-080` payload. */
export interface WardCandidatePayload {
  /** The resident's wording, retained verbatim. */
  readonly description: string;
  /** The area the resident selected, when they selected one. */
  readonly localGovernmentArea?: string;
  /** How many candidates to ask for; `C-078` caps it at three. */
  readonly candidateLimit: number;
}

/**
 * Reads the payload the boundary assembled.
 *
 * @param payload - The allow-listed, scalar payload.
 * @returns The validated payload, or the field map `C-001` defines.
 */
export function readWardCandidatePayload(
  payload: Readonly<Record<string, AllowedValue>>,
): PayloadRead<WardCandidatePayload> {
  const fields: Record<string, string> = {};

  const description = payload.description;
  let descriptionValue = '';
  if (typeof description !== 'string' || description.trim() === '') {
    fields.description = 'REQUIRED';
  } else if (description.length > WARD_DESCRIPTION_MAX_LENGTH) {
    fields.description = 'TOO_LONG';
  } else {
    descriptionValue = description;
  }

  let localGovernmentArea: string | undefined;
  const area = payload.localGovernmentArea;
  if (area !== undefined) {
    if (typeof area !== 'string' || area.trim() === '') {
      fields.localGovernmentArea = 'REQUIRED';
    } else if (area.length > LOCAL_GOVERNMENT_AREA_MAX_LENGTH) {
      fields.localGovernmentArea = 'TOO_LONG';
    } else {
      localGovernmentArea = area;
    }
  }

  let candidateLimit = WARD_CANDIDATE_LIMIT_MAX;
  const limit = payload.candidateLimit;
  if (limit !== undefined) {
    if (
      typeof limit !== 'number' ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > WARD_CANDIDATE_LIMIT_MAX
    ) {
      fields.candidateLimit = 'OUT_OF_BAND';
    } else {
      candidateLimit = limit;
    }
  }

  if (Object.keys(fields).length > 0) return { ok: false, fields };

  return {
    ok: true,
    value: {
      description: descriptionValue,
      ...(localGovernmentArea === undefined ? {} : { localGovernmentArea }),
      candidateLimit,
    },
  };
}
