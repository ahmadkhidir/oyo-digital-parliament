/**
 * Policy tests for the ward reference (`FEAT-002`, `C-010`).
 *
 * Each test names the rule it holds: up to three candidates, duplicate names needing the area, equal
 * matches staying equal, out-of-area exclusion, and the identity transition that a review may or may
 * not make.
 */
import { describe, expect, it } from 'vitest';
import {
  countsInAnswerRateDenominator,
  countsInWardReporting,
  identityStateAfterReview,
  matchWardCandidates,
  movesWithWardResolution,
  normaliseWardText,
  readDescription,
  WARD_CANDIDATE_LIMIT,
  WARD_DESCRIPTION_MAX_LENGTH,
} from './policies.ts';
import type { Ward } from './entities.ts';

const agbowo: Ward = {
  id: 'wrd_AGBOWO',
  name: 'Ward IV, Agbowo',
  localGovernmentArea: 'Ibadan North',
  aliases: ['Agbowo', 'Agbowo Express'],
  source: 'seeded',
  createdAt: '2026-11-18T00:00:00Z',
};

const bodija: Ward = {
  id: 'wrd_BODIJA',
  name: 'Ward V, Bodija',
  localGovernmentArea: 'Ibadan North',
  aliases: [],
  source: 'seeded',
  createdAt: '2026-11-18T00:00:00Z',
};

const okeAfin: Ward = {
  id: 'wrd_OKEAFIN',
  name: 'Ward I, Oke Afin',
  localGovernmentArea: 'Atiba',
  aliases: [],
  source: 'seeded',
  createdAt: '2026-11-18T00:00:00Z',
};

describe('normaliseWardText', () => {
  it('treats case, punctuation and spacing as the same words', () => {
    expect(normaliseWardText('  AGBOWO. ')).toBe('agbowo');
    expect(normaliseWardText('Agbowo — Express')).toBe('agbowo express');
  });
});

describe('matchWardCandidates', () => {
  it('offers the ward whose name matches exactly', () => {
    const result = matchWardCandidates([agbowo, bodija], {
      description: 'Ward IV, Agbowo',
    });
    expect(result.candidates[0]).toMatchObject({
      wardId: 'wrd_AGBOWO',
      rank: 1,
      source: 'exact',
    });
  });

  it('matches an accumulated alias in the resident’s own words', () => {
    const result = matchWardCandidates([agbowo, bodija], {
      description: 'Behind Agbowo market, near the express',
    });
    expect(result.candidates[0]).toMatchObject({
      wardId: 'wrd_AGBOWO',
      source: 'alias',
    });
  });

  it('offers no more than three candidates', () => {
    const wards: Ward[] = Array.from({ length: 6 }, (_, index) => ({
      ...agbowo,
      id: `wrd_${index}`,
      name: `Ward ${index}, Agbowo`,
      aliases: ['Agbowo'],
    }));
    const result = matchWardCandidates(wards, { description: 'Agbowo' });
    expect(result.candidates).toHaveLength(WARD_CANDIDATE_LIMIT);
    expect(result.candidates.map((candidate) => candidate.rank)).toEqual([1, 2, 3]);
  });

  it('requires the local government area when a name is shared across areas', () => {
    const first: Ward = { ...agbowo, id: 'wrd_AWE1', name: 'Ward I, Awe', localGovernmentArea: 'Afijio', aliases: [] };
    const second: Ward = { ...agbowo, id: 'wrd_AWE2', name: 'Ward I, Awe', localGovernmentArea: 'Atiba', aliases: [] };
    const ambiguous = matchWardCandidates([first, second], { description: 'Awe' });
    expect(ambiguous.localGovernmentAreaRequired).toBe(true);

    const narrowed = matchWardCandidates([first, second], {
      description: 'Awe',
      localGovernmentArea: 'Atiba',
    });
    expect(narrowed.localGovernmentAreaRequired).toBe(false);
    expect(narrowed.candidates).toHaveLength(1);
    expect(narrowed.candidates[0]?.wardId).toBe('wrd_AWE2');
  });

  it('keeps equally matching wards together rather than picking one', () => {
    const first: Ward = { ...agbowo, id: 'wrd_TIE1', name: 'Ward II, Ilora', localGovernmentArea: 'Afijio', aliases: [] };
    const second: Ward = { ...agbowo, id: 'wrd_TIE2', name: 'Ward II, Ilora', localGovernmentArea: 'Atiba', aliases: [] };
    const result = matchWardCandidates([first, second], {
      description: 'Ilora',
      localGovernmentArea: 'Afijio',
    });
    expect(result.candidates.map((candidate) => candidate.wardId)).toEqual(['wrd_TIE1']);
    // The same description without an area offers both, in a stable order.
    const unordered = matchWardCandidates([second, first], { description: 'Ilora' });
    expect(unordered.candidates.map((candidate) => candidate.wardId)).toEqual([
      'wrd_TIE1',
      'wrd_TIE2',
    ]);
  });

  it('offers nothing when no ward resembles the description', () => {
    const result = matchWardCandidates([agbowo, okeAfin], {
      description: 'After the old cocoa shed, before the river',
    });
    expect(result.candidates).toEqual([]);
    expect(result.localGovernmentAreaRequired).toBe(false);
  });
});

describe('ward reporting exclusions', () => {
  it('excludes out-of-area submissions from ward pages and the answer rate', () => {
    const outOfArea = { wardStatus: 'unresolved' as const, locationScope: 'out_of_state' as const };
    expect(countsInWardReporting(outOfArea)).toBe(false);
    expect(countsInAnswerRateDenominator(outOfArea)).toBe(false);
  });

  it('keeps an in-state resolved submission in the ward record', () => {
    expect(
      countsInWardReporting({ wardStatus: 'resolved', locationScope: 'in_state' }),
    ).toBe(true);
    expect(countsInAnswerRateDenominator({ locationScope: 'in_state' })).toBe(true);
  });

  it('moves only unresolved in-state submissions onto a resolved ward', () => {
    const base = {
      wardStatus: 'unresolved' as const,
      status: 'awaiting_decision' as const,
      locationScope: 'in_state' as const,
    };
    expect(movesWithWardResolution(base)).toBe(true);
    expect(movesWithWardResolution({ ...base, wardStatus: 'resolved' })).toBe(false);
    expect(movesWithWardResolution({ ...base, locationScope: 'out_of_state' })).toBe(false);
    expect(movesWithWardResolution({ ...base, status: 'out_of_area' })).toBe(false);
  });
});

describe('identity transitions', () => {
  it('moves a registered member to checked only on acceptance', () => {
    expect(identityStateAfterReview('registered', 'checked')).toBe('checked');
    expect(identityStateAfterReview('registered', 'rejected')).toBe('registered');
  });

  it('never demotes a checked member on a rejection', () => {
    expect(identityStateAfterReview('checked', 'rejected')).toBe('checked');
  });
});

describe('readDescription', () => {
  it('refuses a blank description and one longer than the field', () => {
    expect(readDescription('   ')).toEqual({ ok: false, fields: { description: 'REQUIRED' } });
    expect(readDescription('a'.repeat(WARD_DESCRIPTION_MAX_LENGTH + 1))).toEqual({
      ok: false,
      fields: { description: 'TOO_LONG' },
    });
  });

  it('keeps the resident’s wording, trimming only the ends', () => {
    const read = readDescription('  Behind Agbowo market, near the express  ');
    expect(read).toEqual({ ok: true, value: 'Behind Agbowo market, near the express' });
  });
});
