/**
 * The `ward_candidate` result (`C-080`, `FEAT-002`).
 *
 * At most three candidates, each naming a ward, a confidence and its rank. The shape has no field
 * that could record a ward against a member: the model proposes, the resident confirms, and an
 * unconfirmed candidate changes nothing.
 *
 * A malformed provider answer — more candidates than asked for, a duplicate ward, a rank gap, a
 * confidence outside zero to one — is rejected whole rather than repaired. `C-078` forbids a
 * partial result.
 *
 * @module capabilities/ward_candidate/result
 */
import type { WardCandidatePayload } from './payload.ts';

/** The `C-001` identifier form for a ward. */
const WARD_ID_PATTERN = /^wrd_[0-9A-Z]{4,26}$/;

/** One ranked candidate. */
export interface WardCandidate {
  readonly wardId: string;
  /** The provider's confidence, between 0 and 1 inclusive. */
  readonly confidence: number;
  /** One-based position; rank 1 is the candidate the resident is asked to confirm first. */
  readonly rank: number;
}

/** The `C-080` result. */
export interface WardCandidateResult {
  /** Ordered by rank ascending; may be empty when the provider found nothing. */
  readonly candidates: readonly WardCandidate[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads and orders a provider answer.
 *
 * @param raw - The provider's parsed output.
 * @param payload - The validated request, whose `candidateLimit` bounds the list.
 * @returns The ordered result, or `null` when the answer is not exactly valid.
 */
export function readWardCandidateResult(
  raw: unknown,
  payload: WardCandidatePayload,
): WardCandidateResult | null {
  if (!isRecord(raw)) return null;
  const list = raw.candidates;
  if (!Array.isArray(list)) return null;
  if (list.length > payload.candidateLimit) return null;

  const candidates: WardCandidate[] = [];
  const wardIds = new Set<string>();
  const ranks = new Set<number>();

  for (const item of list) {
    if (!isRecord(item)) return null;
    const { wardId, confidence, rank } = item;

    if (typeof wardId !== 'string' || !WARD_ID_PATTERN.test(wardId)) return null;
    if (wardIds.has(wardId)) return null;

    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return null;
    if (confidence < 0 || confidence > 1) return null;

    if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) return null;
    if (rank > list.length || ranks.has(rank)) return null;

    wardIds.add(wardId);
    ranks.add(rank);
    candidates.push({ wardId, confidence, rank });
  }

  candidates.sort((left, right) => left.rank - right.rank);
  return { candidates };
}
