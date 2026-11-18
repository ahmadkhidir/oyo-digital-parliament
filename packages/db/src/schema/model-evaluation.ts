/**
 * ModelEvaluation (`schema.md` ModelEvaluation).
 *
 * One measured run of a model capability against its judged bar, kept so a pinned model version can
 * be defended or withdrawn (`NFR-050` to `NFR-053`). A run with no labelled cases is not a run, so
 * `dataset_size` is at least one; a threshold or result is a plain number, not money.
 */
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core';
import { isIdentifier, utcTimestamp } from './columns.ts';
import { modelCapability } from './enums.ts';

export const modelEvaluation = pgTable(
  'model_evaluation',
  {
    id: text('id').primaryKey(),
    capability: modelCapability('capability').notNull(),
    /** The pinned model version measured. */
    modelVersion: varchar('model_version', { length: 120 }).notNull(),
    datasetSize: integer('dataset_size').notNull(),
    /** The metric measured, as named in the judged bar. */
    metric: varchar('metric', { length: 80 }).notNull(),
    threshold: doublePrecision('threshold').notNull(),
    result: doublePrecision('result').notNull(),
    passed: boolean('passed').notNull(),
    runAt: utcTimestamp('run_at').notNull(),
  },
  (t) => [
    check('model_evaluation_id_format', isIdentifier(t.id)),
    check('model_evaluation_dataset_size', sql`${t.datasetSize} >= 1`),
    // Read path: the latest run for a capability when a pinned version is reviewed (`NFR-050`).
    index('model_evaluation_capability_idx').on(t.capability, t.runAt),
  ],
);

export const modelEvaluationRelations = relations(modelEvaluation, () => ({}));
