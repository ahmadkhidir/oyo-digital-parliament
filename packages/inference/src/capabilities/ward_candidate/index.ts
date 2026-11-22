/**
 * The `ward_candidate` capability (`C-080`, `FEAT-002`, `NFR-051`).
 *
 * It ranks up to three candidate wards and stops there. It never records a ward, changes a member's
 * status or blocks a resident: the caller renders the list for confirmation and, when nothing is
 * accepted, the deterministic path and the review queue are already sufficient.
 *
 * @module capabilities/ward_candidate
 */
import type { CapabilityDefinition } from '../definition.ts';
import { WARD_CANDIDATE_INSTRUCTION, WARD_CANDIDATE_INSTRUCTION_VERSION } from './instruction.ts';
import { readWardCandidatePayload, type WardCandidatePayload } from './payload.ts';
import { readWardCandidateResult, type WardCandidateResult } from './result.ts';

export {
  readWardCandidatePayload,
  WARD_CANDIDATE_LIMIT_MAX,
  WARD_DESCRIPTION_MAX_LENGTH,
  type WardCandidatePayload,
} from './payload.ts';
export { readWardCandidateResult, type WardCandidate, type WardCandidateResult } from './result.ts';
export { WARD_CANDIDATE_INSTRUCTION, WARD_CANDIDATE_INSTRUCTION_VERSION } from './instruction.ts';

/** The pinned `ward_candidate` declaration. */
export const wardCandidateCapability: CapabilityDefinition<
  WardCandidatePayload,
  WardCandidateResult
> = {
  name: 'ward_candidate',
  flag: 'ward_candidate_suggestions',
  instructionVersion: WARD_CANDIDATE_INSTRUCTION_VERSION,
  instruction: WARD_CANDIDATE_INSTRUCTION,
  fallback:
    'Alias and exact matching only; when neither returns a candidate the description enters the ward review queue (FEAT-002).',
  metric: {
    id: 'top_candidate_confirmation_rate',
    threshold: 0.7,
    minimumDatasetSize: 200,
    anchor: 'NFR-051',
  },
  readPayload: readWardCandidatePayload,
  readResult: readWardCandidateResult,
};
