/**
 * The object-key scheme (`C-036`, `C-088`).
 *
 * A key states its kind, its scope and its generation, and carries nothing a person said. These
 * tests pin the shape and prove that a personal value cannot be smuggled into a key.
 */
import { describe, expect, it } from 'vitest';

import {
  evaluationArtefactKey,
  handoverSnapshotKey,
  memberExportKey,
  reportCardKey,
} from './keys.ts';

const instant = new Date('2026-11-25T12:00:00Z');

describe('object keys', () => {
  it('names the kind, the scope and the generation for an export', () => {
    expect(
      memberExportKey({ dataRequestId: 'drq_01J9Z6K4Q3W8R2T5Y7B1C0D9EF', generatedAt: instant }),
    ).toBe('exports/request/drq_01J9Z6K4Q3W8R2T5Y7B1C0D9EF/20261125T120000Z');
  });

  it('keeps a report card under its quarter', () => {
    expect(reportCardKey({ quarter: '2026-Q4', generatedAt: instant })).toBe(
      'report-cards/2026-Q4/20261125T120000Z',
    );
  });

  it('gives two handover snapshots in one second distinct keys', () => {
    const first = handoverSnapshotKey({ generatedAt: instant, generation: 1 });
    const second = handoverSnapshotKey({ generatedAt: instant, generation: 2 });
    expect(first).not.toBe(second);
  });

  it('names an evaluation artefact by capability and evaluation', () => {
    expect(
      evaluationArtefactKey({
        capability: 'moderation_routing',
        modelEvaluationId: 'mev_01J9Z6K4Q3W8R2T5Y7B1C0D9EF',
        name: 'run.json',
      }),
    ).toBe('evaluations/moderation_routing/mev_01J9Z6K4Q3W8R2T5Y7B1C0D9EF/run.json');
  });

  it('refuses a value that is not an identifier of the expected kind', () => {
    expect(() => memberExportKey({ dataRequestId: 'Adaeze Okafor', generatedAt: instant })).toThrow(
      /not a record identifier/,
    );
    expect(() =>
      memberExportKey({ dataRequestId: 'sub_01J9Z6K4Q3W8R2T5Y7B1C0D9EF', generatedAt: instant }),
    ).toThrow(/not a record identifier/);
  });

  it('refuses a malformed quarter or an artefact path', () => {
    expect(() => reportCardKey({ quarter: 'Q4 2026', generatedAt: instant })).toThrow(/YYYY-Qn/);
    expect(() =>
      evaluationArtefactKey({
        capability: 'ward_candidate',
        modelEvaluationId: 'mev_01J9Z6K4Q3W8R2T5Y7B1C0D9EF',
        name: '../etc/passwd',
      }),
    ).toThrow(/file name/);
  });

  it('never carries a personal field', () => {
    const key = memberExportKey({
      dataRequestId: 'drq_01J9Z6K4Q3W8R2T5Y7B1C0D9EF',
      generatedAt: instant,
    });
    // The key is exactly the kind, the opaque request identifier and the generation stamp.
    expect(key).toBe('exports/request/drq_01J9Z6K4Q3W8R2T5Y7B1C0D9EF/20261125T120000Z');
    expect(key.split('/')).toHaveLength(4);
  });
});
