/**
 * The ward list route's transport tests (`C-009`, `screens/05-ward-confirmation.md`).
 *
 * The route answers one page of the reference in the contract's shape. The boundary refuses a
 * malformed page size before the domain runs; the projection prints exactly the fields `C-009`
 * prints — no member, no count and no personal field.
 */
import { describe, expect, it } from 'vitest';
import type { Ward } from '@odp/domain';
import { parseWardListQuery, wardListData } from './ward-list';

describe('parseWardListQuery (C-009 query)', () => {
  it('accepts an empty query', () => {
    expect(parseWardListQuery(new URLSearchParams())).toEqual({ ok: true, input: {} });
  });

  it('reads the area, cursor and page size', () => {
    expect(
      parseWardListQuery(
        new URLSearchParams({
          localGovernmentArea: 'Ibadan North',
          cursor: 'cur_0004',
          limit: '20',
        }),
      ),
    ).toEqual({
      ok: true,
      input: { localGovernmentArea: 'Ibadan North', cursor: 'cur_0004', limit: 20 },
    });
  });

  it('refuses a page size that is not a whole number', () => {
    expect(parseWardListQuery(new URLSearchParams({ limit: 'five' }))).toMatchObject({
      ok: false,
      failure: { code: 'VALIDATION_FAILED', cause: 'WARD_LIST_QUERY_INVALID' },
    });
  });

  it('refuses a page size below one', () => {
    expect(parseWardListQuery(new URLSearchParams({ limit: '0' }))).toMatchObject({ ok: false });
  });
});

describe('wardListData (C-009 response)', () => {
  it('prints the stored fields and nothing else', () => {
    const ward: Ward = {
      id: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
      name: 'Ward IV, Agbowo',
      localGovernmentArea: 'Ibadan North',
      aliases: ['Agbowo'],
      source: 'seeded',
      createdAt: '2026-09-01T08:00:00Z',
    };
    expect(wardListData([ward])).toEqual([
      {
        id: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
        name: 'Ward IV, Agbowo',
        localGovernmentArea: 'Ibadan North',
        aliases: ['Agbowo'],
        source: 'seeded',
        createdAt: '2026-09-01T08:00:00Z',
      },
    ]);
  });
});
