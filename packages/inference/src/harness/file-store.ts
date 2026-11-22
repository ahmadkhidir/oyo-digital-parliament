/**
 * A file-backed evaluation store (`architecture.md` Evaluation Harness).
 *
 * The harness's durable records are a `ModelEvaluation` row in the primary database and a run
 * artefact in object storage. This package owns neither, so the store is a port. This adapter is the
 * local run artefact: one JSON file per evaluation, named by its opaque identifier and containing the
 * evaluation and its failing cases — never a resident description.
 *
 * The production composition supplies a store that writes both the database row and the bucket
 * object; the harness does not care which.
 *
 * @module harness/file-store
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { EvaluationRun, EvaluationStore } from './types.ts';

/**
 * Builds a store that writes one JSON artefact per run.
 *
 * @param directory - Where artefacts are written. Created on first save.
 */
export function createJsonFileEvaluationStore(directory: string): EvaluationStore {
  return {
    async save(run: EvaluationRun): Promise<void> {
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${run.evaluation.id}.json`);
      await writeFile(path, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    },
  };
}
