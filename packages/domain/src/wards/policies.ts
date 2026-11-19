/**
 * The ward-reference invariants (`FEAT-002`, `C-009` to `C-011`, `C-055` to `C-057`).
 *
 * Everything here is a pure, total function: no I/O, no clock, no mutation. The matching rule is the
 * deterministic fallback the specification pins - alias and exact matching only - and it is written
 * down once so the candidate endpoint, the confirmation action and the reviewer's picker cannot drift
 * apart (`packages/domain/AGENTS.md` Discipline).
 */
import type {
  IdentityState,
  LocationScope,
  ResidenceReviewDecision,
  SubmissionStatus,
  Ward,
  WardCaller,
  WardCandidate,
  WardDescriptionReviewStatus,
  WardFieldReason,
  WardStatus,
} from './entities.ts';

/** `WardDescriptionReview.description` is 500 characters (`schema.md`). */
export const WARD_DESCRIPTION_MAX_LENGTH = 500;
/** `Ward.localGovernmentArea` and `WardDescriptionReview.localGovernmentArea` are 120. */
export const WARD_LOCAL_GOVERNMENT_AREA_MAX_LENGTH = 120;
/** `ResidenceReview.notes` is 1000 (`C-057`). */
export const RESIDENCE_REVIEW_NOTES_MAX_LENGTH = 1000;
/** `WardDescriptionReview.rejectionReason` is 500 (`C-056`). */
export const WARD_REJECTION_REASON_MAX_LENGTH = 500;
/** `C-001` pagination: limit defaults to 20 and never exceeds 50. */
export const WARD_PAGE_DEFAULT_LIMIT = 20;
export const WARD_PAGE_MAX_LIMIT = 50;
/** `C-010` returns up to three candidates. */
export const WARD_CANDIDATE_LIMIT = 3;

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lower-cases, strips accents and reduces everything that is not a letter or a digit to one space.
 *
 * Two residents writing `Agbowo`, `agbowo` and `AGBOWO.` mean the same place, and a match that
 * depends on case or punctuation is a match that fails in the field.
 */
export function normaliseWardText(value: string): string {
  return value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Words that name the shape of the reference rather than the place.
 *
 * `Ward IV, Agbowo` must match a description of `Agbowo`, not every ward in the state because the
 * word `ward` is common to all 351 names. Numerals and connectives are equally unhelpful.
 */
const GENERIC_TOKENS = new Set([
  'ward',
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
  'xi',
  'xii',
  'xiii',
  'xiv',
  'xv',
  'the',
  'of',
  'and',
  'area',
  'near',
  'by',
]);

/** The words of a name or alias that actually identify a place. */
export function distinctiveTokens(value: string): readonly string[] {
  return normaliseWardText(value)
    .split(' ')
    .filter((token) => token.length > 0 && !GENERIC_TOKENS.has(token));
}

/** One scored match before ranking. */
export interface WardMatch {
  readonly ward: Ward;
  /** Higher is a closer match. Only the ordering is promised; the number itself is not a contract. */
  readonly score: number;
  readonly source: 'exact' | 'alias';
}

/**
 * Scores one term (`exact` for the ward's name, `alias` for an accumulated alias) against a
 * normalised description.
 *
 * Scores are ordered so every exact form beats every partial one: equality first, then containment,
 * then shared distinctive words. That keeps `Agbowo` ahead of `Agbowo Express` for a description of
 * `agbowo`, and it means two wards with the same kind of match tie and are offered together rather
 * than one silently winning (`FEAT-002` edge cases).
 */
function scoreTerm(
  description: string,
  descriptionTokens: readonly string[],
  term: string,
): number {
  if (term.length === 0) return 0;
  if (term === description) return 1000;
  if (description.length >= 4 && term.includes(description)) return 700 + description.length;
  if (term.length >= 4 && description.includes(term)) return 600 + term.length;

  const tokens = distinctiveTokens(term);
  if (tokens.length === 0 || descriptionTokens.length === 0) return 0;
  const shared = tokens.filter((token) => descriptionTokens.includes(token)).length;
  if (shared === 0) return 0;
  // A shared distinctive word is a real match; the ratio keeps a two-word name ahead of a one-word
  // one, and the score stays below every containment match.
  return 300 + Math.round((shared / tokens.length) * 200);
}

/** The best match one ward offers, its name competing against every accumulated alias. */
export function scoreWard(ward: Ward, description: string): WardMatch | null {
  const descriptionNorm = normaliseWardText(description);
  if (descriptionNorm.length === 0) return null;
  const descriptionTokens = distinctiveTokens(description);

  const byName = scoreTerm(descriptionNorm, descriptionTokens, normaliseWardText(ward.name));
  const aliasScores = ward.aliases.map((alias) =>
    scoreTerm(descriptionNorm, descriptionTokens, normaliseWardText(alias)),
  );
  const bestAlias = aliasScores.reduce((best, score) => (score > best ? score : best), 0);

  // Name and alias describe the same ward, so the field that scored higher names the source.
  if (byName === 0 && bestAlias === 0) return null;
  return bestAlias > byName
    ? { ward, score: bestAlias, source: 'alias' }
    : { ward, score: byName, source: 'exact' };
}

/** Deterministic tie-break: name, then local government area, then identifier. */
function compareMatches(left: WardMatch, right: WardMatch): number {
  if (right.score !== left.score) return right.score - left.score;
  const byName = left.ward.name.localeCompare(right.ward.name);
  if (byName !== 0) return byName;
  const byArea = left.ward.localGovernmentArea.localeCompare(right.ward.localGovernmentArea);
  if (byArea !== 0) return byArea;
  return left.ward.id.localeCompare(right.ward.id);
}

/** The outcome of matching one description against the reference. */
export interface WardMatchResult {
  /** Up to {@link WARD_CANDIDATE_LIMIT} candidates, ranked 1 upward. Never an assignment. */
  readonly candidates: readonly WardCandidate[];
  /**
   * `true` when the description matched wards that share a name in more than one local government
   * area and no area was supplied. `C-010`/`C-011` refuse that request with
   * `localGovernmentArea: REQUIRED` rather than offering an ambiguous name (`FEAT-002`).
   */
  readonly localGovernmentAreaRequired: boolean;
}

/**
 * Matches a resident's description against the whole ward reference.
 *
 * The area filter is applied before ranking when one is given, so a resident who picks their local
 * government area is never offered a ward outside it. When it is absent, the duplicate-name check
 * runs over every match, not just the three that would be shown.
 *
 * @param wards - The reference as stored: seeded, confirmed and reviewed wards alike.
 * @param input - The resident's words and the area they selected, when they selected one.
 */
export function matchWardCandidates(
  wards: readonly Ward[],
  input: { readonly description: string; readonly localGovernmentArea?: string },
): WardMatchResult {
  const area = input.localGovernmentArea?.trim();
  const areaNorm = area === undefined || area === '' ? null : normaliseWardText(area);
  const pool =
    areaNorm === null
      ? wards
      : wards.filter((ward) => normaliseWardText(ward.localGovernmentArea) === areaNorm);

  const matches = pool
    .map((ward) => scoreWard(ward, input.description))
    .filter((match): match is WardMatch => match !== null)
    .sort(compareMatches);

  // Two wards in different areas sharing one name need the area before a candidate is offered.
  const areasByName = new Map<string, Set<string>>();
  for (const match of matches) {
    const name = normaliseWardText(match.ward.name);
    const areas = areasByName.get(name) ?? new Set<string>();
    areas.add(normaliseWardText(match.ward.localGovernmentArea));
    areasByName.set(name, areas);
  }
  const localGovernmentAreaRequired =
    areaNorm === null && [...areasByName.values()].some((areas) => areas.size > 1);

  const candidates = matches.slice(0, WARD_CANDIDATE_LIMIT).map((match, index) => ({
    wardId: match.ward.id,
    name: match.ward.name,
    localGovernmentArea: match.ward.localGovernmentArea,
    rank: index + 1,
    source: match.source,
  }));

  return { candidates, localGovernmentAreaRequired };
}

/**
 * Whether a submission belongs to the ward record at all.
 *
 * Out-of-area submissions are accepted and shown to their author, but they are excluded from ward
 * pages and from the answer-rate denominator (`FEAT-002`, `FEAT-008`), and an unresolved ward has
 * nothing to report on yet.
 */
export function countsInWardReporting(input: {
  readonly wardStatus: WardStatus;
  readonly locationScope: LocationScope;
}): boolean {
  return input.wardStatus === 'resolved' && input.locationScope === 'in_state';
}

/**
 * Whether a submission counts toward the answer rate's denominator.
 *
 * `C-074` excludes only out-of-area submissions; a withheld submission stays in the denominator until
 * it is cleared.
 */
export function countsInAnswerRateDenominator(input: {
  readonly locationScope: LocationScope;
}): boolean {
  return input.locationScope === 'in_state';
}

/**
 * Whether a reviewer's resolution moves this submission onto the resolved ward.
 *
 * Only an in-state submission that still has no ward moves: an already-placed submission keeps the
 * ward it was recorded against, and an out-of-area record must never be given one (`FEAT-002`,
 * `C-056`).
 */
export function movesWithWardResolution(input: {
  readonly wardStatus: WardStatus;
  readonly status: SubmissionStatus;
  readonly locationScope: LocationScope;
}): boolean {
  return (
    input.wardStatus === 'unresolved' &&
    input.locationScope === 'in_state' &&
    input.status !== 'out_of_area'
  );
}

/**
 * The identity state a residence review leaves the member in (`FEAT-001`, `C-057`).
 *
 * Acceptance moves the member to checked. A rejection leaves a registered member registered; it never
 * demotes a member who is already checked, because a rejection is not a revocation and the two-state
 * identity model has no third state to fall back to.
 */
export function identityStateAfterReview(
  current: IdentityState,
  decision: ResidenceReviewDecision,
): IdentityState {
  return decision === 'checked' ? 'checked' : current;
}

/** A residence can only be accepted for a member whose ward is recorded (`C-057`). */
export function residenceReviewNeedsRecordedWard(decision: ResidenceReviewDecision): boolean {
  return decision === 'checked';
}

/** Whether the caller holds the response-staff role the review actions require. */
export function isWardReviewer(caller: WardCaller): boolean {
  return caller.kind === 'staff' && caller.role === 'response_staff';
}

/** Whether a status names one of the three review states. */
export function isWardDescriptionReviewStatus(
  value: unknown,
): value is WardDescriptionReviewStatus {
  return value === 'queued' || value === 'resolved' || value === 'rejected';
}

/** A validation result for one string field. */
export type FieldReading =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly fields: Readonly<Record<string, WardFieldReason>> };

/**
 * Reads a required description: present, not blank, and no longer than the schema allows.
 *
 * The value is returned untrimmed except for the ends: the resident's spacing inside their own words
 * is theirs, and a review shows the description as they wrote it.
 */
export function readDescription(raw: unknown): FieldReading {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, fields: { description: 'REQUIRED' } };
  }
  const value = raw.trim();
  if (value.length > WARD_DESCRIPTION_MAX_LENGTH) {
    return { ok: false, fields: { description: 'TOO_LONG' } };
  }
  return { ok: true, value };
}

/** Reads the optional local government area: absent, or a non-blank string within the column. */
export function readLocalGovernmentArea(raw: unknown): FieldReading {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, value: '' };
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, fields: { localGovernmentArea: 'PATTERN_MISMATCH' } };
  }
  const value = raw.trim();
  if (value.length > WARD_LOCAL_GOVERNMENT_AREA_MAX_LENGTH) {
    return { ok: false, fields: { localGovernmentArea: 'TOO_LONG' } };
  }
  return { ok: true, value };
}

/** Reads the optional reviewer note against its column. */
export function readResidenceNotes(
  raw: unknown,
):
  | { readonly ok: true; readonly value?: string }
  | { readonly ok: false; readonly fields: Readonly<Record<string, WardFieldReason>> } {
  if (raw === undefined || raw === null) return { ok: true };
  if (typeof raw !== 'string') {
    return { ok: false, fields: { notes: 'PATTERN_MISMATCH' } };
  }
  const value = raw.trim();
  if (value.length === 0) return { ok: true };
  if (value.length > RESIDENCE_REVIEW_NOTES_MAX_LENGTH) {
    return { ok: false, fields: { notes: 'TOO_LONG' } };
  }
  return { ok: true, value };
}

/** Reads a page size against `C-001` pagination. */
export function readPageLimit(
  raw: unknown,
):
  | { readonly ok: true; readonly value: number }
  | { readonly ok: false; readonly fields: Readonly<Record<string, WardFieldReason>> } {
  if (raw === undefined || raw === null) return { ok: true, value: WARD_PAGE_DEFAULT_LIMIT };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > WARD_PAGE_MAX_LIMIT) {
    return { ok: false, fields: { limit: 'OUT_OF_BAND' } };
  }
  return { ok: true, value: raw };
}
