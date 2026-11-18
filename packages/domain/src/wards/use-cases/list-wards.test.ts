/**
 * `C-009` tests: the public ward list. A failed read is `SERVICE_DEGRADED`, which is the signal the
 * client uses to fall back to the free-text field alone (`FEAT-002`).
 */
import { describe, expect, it } from 'vitest';
import { listWards } from './list-wards.ts';
import { createWardHarness, fakeWard } from '../fakes.ts';

const wards = [
  fakeWard({ id: 'wrd_1', name: 'Ward I, Ilora', localGovernmentArea: 'Afijio' }),
  fakeWard({ id: 'wrd_2', name: 'Ward II, Ilora', localGovernmentArea: 'Afijio' }),
  fakeWard({ id: 'wrd_3', name: 'Ward IV, Agbowo', localGovernmentArea: 'Ibadan North' }),
];

describe('listWards', () => {
  it('filters by local government area and pages with a cursor', async () => {
    const fakes = createWardHarness({ wards });
    const first = await listWards({ kind: 'public' }, fakes.ports, {
      localGovernmentArea: 'Afijio',
      limit: 1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.wards.map((ward) => ward.id)).toEqual(['wrd_1']);
    expect(first.nextCursor).not.toBeNull();

    const second = await listWards({ kind: 'public' }, fakes.ports, {
      localGovernmentArea: 'Afijio',
      limit: 1,
      ...(first.nextCursor === null ? {} : { cursor: first.nextCursor }),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.wards.map((ward) => ward.id)).toEqual(['wrd_2']);
    expect(second.nextCursor).toBeNull();
  });

  it('refuses a page size outside the contract', async () => {
    const fakes = createWardHarness({ wards });
    const result = await listWards({ kind: 'public' }, fakes.ports, { limit: 51 });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { limit: 'OUT_OF_BAND' },
    });
  });

  it('reports the reference as unavailable', async () => {
    const fakes = createWardHarness({ wards, referenceUnavailable: true });
    const result = await listWards({ kind: 'public' }, fakes.ports, {});
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'WARD_REFERENCE_UNAVAILABLE',
    });
  });
});
