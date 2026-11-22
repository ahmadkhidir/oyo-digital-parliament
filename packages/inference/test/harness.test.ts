/**
 * The evaluation runner (`NFR-051`, `architecture.md` Evaluation Harness).
 *
 * The gateway is real; only the provider answer is scripted. The run must store the
 * `ModelEvaluation` — sample size, metric, threshold and result — and list what failed.
 */
import { describe, expect, it } from 'vitest';

import {
  createInferenceGateway,
  runWardCandidateEvaluation,
  wardCandidateCapability,
  type EvaluationRun,
  type EvaluationStore,
  type WardCandidateCase,
  type WardCandidateLabelledSet,
} from '../src/index.ts';
import {
  jsonResponse,
  providerBody,
  recordingAudit,
  recordingTelemetry,
  testConfig,
} from './support.ts';

const TOP = 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM';
const OTHER = 'wrd_01J9Z5B2C3D4E5F6G7H8J9KMP';

function memoryStore(): EvaluationStore & { readonly runs: EvaluationRun[] } {
  const runs: EvaluationRun[] = [];
  return {
    runs,
    save: async (run) => {
      runs.push(run);
    },
  };
}

/** A provider whose first candidate is the ward named by the description. */
function wardProvider(): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { payload: { description: string } };
    const wardId = body.payload.description === 'Agbowo' ? TOP : OTHER;
    return jsonResponse(
      providerBody(
        {
          candidates: [
            { wardId, confidence: 0.9, rank: 1 },
            { wardId: wardId === TOP ? OTHER : TOP, confidence: 0.2, rank: 2 },
          ],
        },
        { units: 1 },
      ),
    );
  }) as unknown as typeof fetch;
}

function gateway(): ReturnType<typeof createInferenceGateway> {
  return createInferenceGateway({
    config: testConfig(),
    telemetry: recordingTelemetry(),
    audit: recordingAudit(),
    fetch: wardProvider(),
  });
}

function caseSet(cases: readonly WardCandidateCase[]): WardCandidateLabelledSet {
  return { capability: 'ward_candidate', cases };
}

describe('runWardCandidateEvaluation', () => {
  it('stores the result against NFR-051 and lists the failing cases', async () => {
    const store = memoryStore();
    const run = await runWardCandidateEvaluation(
      {
        gateway: gateway(),
        store,
        metric: wardCandidateCapability.metric,
        modelVersion: 'odp-ward-test-1',
        newEvaluationId: () => 'mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ',
        now: () => new Date('2026-11-18T09:14:00.000Z'),
      },
      caseSet([
        { caseId: 'case-1', description: 'Agbowo', confirmedWardId: TOP },
        { caseId: 'case-2', description: 'Bodija', confirmedWardId: TOP },
      ]),
    );

    expect(store.runs).toHaveLength(1);
    expect(run.evaluation).toEqual({
      id: 'mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ',
      capability: 'ward_candidate',
      modelVersion: 'odp-ward-test-1',
      datasetSize: 2,
      metric: 'top_candidate_confirmation_rate',
      threshold: 0.7,
      result: 0.5,
      // Two cases are short of the two hundred NFR-051 requires.
      passed: false,
      runAt: '2026-11-18T09:14:00.000Z',
    });
    expect(run.failingCases).toEqual([
      {
        caseId: 'case-2',
        expectedWardId: TOP,
        topWardId: OTHER,
        outcome: 'ok',
        reasonCode: null,
      },
    ]);
  });

  it('passes a full two-hundred-case set that clears the bar', async () => {
    const cases: WardCandidateCase[] = Array.from({ length: 200 }, (_unused, index) => ({
      caseId: `case-${index + 1}`,
      description: 'Agbowo',
      localGovernmentArea: 'Ibadan North',
      confirmedWardId: TOP,
    }));
    const store = memoryStore();

    const run = await runWardCandidateEvaluation(
      {
        gateway: gateway(),
        store,
        metric: wardCandidateCapability.metric,
        modelVersion: 'odp-ward-test-1',
        newEvaluationId: () => 'mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ',
        now: () => new Date('2026-11-18T09:14:00.000Z'),
      },
      caseSet(cases),
    );

    expect(run.evaluation.datasetSize).toBe(200);
    expect(run.evaluation.result).toBe(1);
    expect(run.evaluation.passed).toBe(true);
    expect(run.failingCases).toHaveLength(0);
    expect(store.runs).toHaveLength(1);
  });

  it('records a miss for every case the capability could not answer', async () => {
    const store = memoryStore();
    const unavailable = createInferenceGateway({
      config: testConfig({ featureFlags: {} }),
      telemetry: recordingTelemetry(),
      audit: recordingAudit(),
    });

    const run = await runWardCandidateEvaluation(
      {
        gateway: unavailable,
        store,
        metric: { ...wardCandidateCapability.metric, minimumDatasetSize: 1 },
        modelVersion: 'odp-ward-test-1',
        newEvaluationId: () => 'mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ',
        now: () => new Date('2026-11-18T09:14:00.000Z'),
      },
      caseSet([{ caseId: 'case-1', description: 'Agbowo', confirmedWardId: TOP }]),
    );

    expect(run.evaluation.result).toBe(0);
    expect(run.failingCases).toEqual([
      {
        caseId: 'case-1',
        expectedWardId: TOP,
        topWardId: null,
        outcome: 'disabled',
        reasonCode: 'CAPABILITY_DISABLED',
      },
    ]);
  });

  it('refuses an empty set rather than storing a meaningless run', async () => {
    await expect(
      runWardCandidateEvaluation(
        {
          gateway: gateway(),
          store: memoryStore(),
          metric: wardCandidateCapability.metric,
          modelVersion: 'odp-ward-test-1',
          newEvaluationId: () => 'mev_01J9ZM1N3P5Q7R9S1T3V5W7XYZ',
          now: () => new Date('2026-11-18T09:14:00.000Z'),
        },
        caseSet([]),
      ),
    ).rejects.toThrow(/no labelled cases/);
  });
});
