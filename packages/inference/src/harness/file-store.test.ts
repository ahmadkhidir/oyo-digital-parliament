/**
 * The local run-artefact store (`architecture.md` Evaluation Harness).
 *
 * A run artefact carries the evaluation and its failing cases, never a resident description.
 */
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createJsonFileEvaluationStore, type EvaluationRun } from '../index.ts';

const run: EvaluationRun = {
  evaluation: {
    id: 'mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ',
    capability: 'ward_candidate',
    modelVersion: 'odp-ward-test-1',
    datasetSize: 2,
    metric: 'top_candidate_confirmation_rate',
    threshold: 0.7,
    result: 0.5,
    passed: false,
    runAt: '2026-11-18T09:14:00.000Z',
  },
  failingCases: [
    {
      caseId: 'case-2',
      expectedWardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
      topWardId: 'wrd_01J9Z5B2C3D4E5F6G7H8J9KMP',
      outcome: 'ok',
      reasonCode: null,
    },
  ],
};

describe('createJsonFileEvaluationStore', () => {
  it('writes one artefact named by the evaluation identifier', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'odp-inference-eval-'));
    const store = createJsonFileEvaluationStore(directory);

    await store.save(run);

    const text = await readFile(join(directory, `${run.evaluation.id}.json`), 'utf8');
    expect(JSON.parse(text)).toEqual(run);
    expect(text).not.toContain('description');
  });
});
