/**
 * The adapter used when no model provider is configured (`MODEL_PROVIDER=none`).
 *
 * It reports `PROVIDER_UNAVAILABLE` rather than making up an answer, which is the honest state of a
 * deployment that has no model account yet and keeps every capability on its deterministic path
 * (`C-078`, `NFR-045`).
 *
 * @module adapters/none/adapter
 */
import type { ModelAdapter, ModelAdapterResult } from '../types.ts';

/** An adapter for a deployment with no configured provider. */
export const noneModelAdapter: ModelAdapter = {
  send: async (): Promise<ModelAdapterResult> => ({
    outcome: 'error',
    cause: 'PROVIDER_UNAVAILABLE',
    usage: null,
  }),
};
