/**
 * The versioned `ward_candidate` instruction (`C-080`, `packages/inference/AGENTS.md`).
 *
 * The instruction is part of the pinned contract: changing it changes capability behaviour and
 * therefore requires a stored evaluation run. It contains only fixed text — a caller's description
 * arrives in the payload, never here.
 *
 * @module capabilities/ward_candidate/instruction
 */

/** The instruction's version. Bump only with a re-measured `NFR-051` run. */
export const WARD_CANDIDATE_INSTRUCTION_VERSION = 'ward-candidate-2026-08-1';

/**
 * The instruction sent with every `ward_candidate` call.
 *
 * It asks for a ranked list and explicitly forbids an assignment: the provider is not permitted to
 * choose a ward for the resident, and the result shape carries no field through which it could.
 */
export const WARD_CANDIDATE_INSTRUCTION = [
  'You rank candidate wards for a ward-reference service in Oyo State, Nigeria.',
  'The payload holds a resident description of their area, the local government area they selected,',
  'and how many candidates to return.',
  'Return strictly a JSON object of the form {"candidates":[{"wardId":string,"confidence":number,"rank":number}]}.',
  'Use only ward identifiers from the Oyo State ward reference supplied to you.',
  'Return at most candidateLimit candidates, ranked from most likely to least likely; rank starts at 1.',
  'confidence is a number from 0 to 1.',
  'Never assign a ward, never invent a ward identifier, and return an empty candidates list when you',
  'cannot identify one. Do not address the resident and do not add any other field.',
].join(' ');
