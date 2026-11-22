/**
 * The evaluation harness entry point (`pnpm --filter @odp/inference eval -- --capability ward_candidate`).
 *
 * It runs the fixed `NFR-051` labelled set through the real gateway, stores the `ModelEvaluation`
 * and its failing cases as a run artefact, prints the result and exits non-zero when the bar is
 * missed. It never invents a labelled set: the two hundred real descriptions are collected during
 * assisted intake and checked by the ward-reference reviewer, and the run refuses to start until
 * the set exists.
 *
 * The pinned capability is enabled in the run's own configuration, because the harness measures a
 * version before promotion; no production flag is touched.
 *
 * Run from the package root, which `pnpm --filter` sets:
 *
 *   pnpm --filter @odp/inference eval -- --capability ward_candidate
 *   pnpm --filter @odp/inference eval -- --capability ward_candidate --set eval/ward_candidate/labelled-set.json
 *
 * @module eval/run
 */
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  createInferenceGateway,
  createJsonFileEvaluationStore,
  defineInferenceConfig,
  runWardCandidateEvaluation,
  wardCandidateCapability,
  type InferenceAuditEvent,
  type ModelFallbackTriggeredEvent,
  type ModelRequestCompletedEvent,
  type WardCandidateLabelledSet,
} from '../src/index.ts';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Mints a `mev_` identifier: the prefix `C-001` records, then 26 opaque characters. */
function mintEvaluationId(): string {
  const bytes = randomBytes(26);
  let body = '';
  for (const byte of bytes) body += CROCKFORD[byte % CROCKFORD.length];
  return `mev_${body}`;
}

interface Arguments {
  readonly capability: string;
  readonly setPath: string;
  readonly runsDirectory: string;
}

function parseArguments(argv: readonly string[]): Arguments | string {
  let capability = 'ward_candidate';
  let setPath = 'eval/ward_candidate/labelled-set.json';
  let runsDirectory = 'eval/runs';

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--capability' && value !== undefined) {
      capability = value;
      index += 1;
    } else if (argument === '--set' && value !== undefined) {
      setPath = value;
      index += 1;
    } else if (argument === '--runs' && value !== undefined) {
      runsDirectory = value;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      return 'help';
    } else {
      return `unknown or incomplete argument: ${argument ?? ''}`;
    }
  }

  return { capability, setPath, runsDirectory };
}

function envValue(name: string): string | null {
  const value = process.env[name];
  return value === undefined || value === '' ? null : value;
}

function envInteger(name: string, fallback: number): number {
  const raw = envValue(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
}

/** Reads the labelled set, refusing anything that is not an array of cases. */
async function readLabelledSet(path: string): Promise<WardCandidateLabelledSet> {
  const text = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(text);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('cases' in parsed) ||
    !Array.isArray((parsed as { cases: unknown }).cases)
  ) {
    throw new Error(`${path} is not a labelled set`);
  }
  return parsed as WardCandidateLabelledSet;
}

async function main(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed === 'help') {
    console.log(
      [
        'Usage: pnpm --filter @odp/inference eval -- --capability ward_candidate [--set <path>] [--runs <dir>]',
        '',
        'Reads the provider settings from MODEL_* in the environment, runs the fixed labelled set',
        'through the gateway, stores the ModelEvaluation and exits 1 when the bar is missed.',
      ].join('\n'),
    );
    return 0;
  }
  if (typeof parsed === 'string') {
    console.error(parsed);
    return 2;
  }
  if (parsed.capability !== 'ward_candidate') {
    console.error(
      `${parsed.capability} is not carried by this build; only ward_candidate has a pinned capability and a judged bar.`,
    );
    return 2;
  }

  const provider = envValue('MODEL_PROVIDER') ?? 'none';
  if (provider !== 'http') {
    console.error(
      'No model provider is configured (MODEL_PROVIDER is not http). There is nothing to measure; the deterministic path is the current behaviour.',
    );
    return 2;
  }

  let set: WardCandidateLabelledSet;
  try {
    set = await readLabelledSet(resolve(parsed.setPath));
  } catch (error) {
    console.error(
      `The NFR-051 labelled set could not be read from ${parsed.setPath}: ${(error as Error).message}`,
    );
    console.error(
      'The two hundred real descriptions are collected during assisted intake and checked by the ward-reference reviewer; the harness never fabricates a set.',
    );
    return 2;
  }

  let config;
  try {
    config = defineInferenceConfig({
      provider: 'http',
      apiUrl: envValue('MODEL_API_URL'),
      apiKey: envValue('MODEL_API_KEY'),
      region: envValue('MODEL_REGION'),
      capabilities: {
        similar_submission: {
          version: envValue('MODEL_VERSION_SIMILAR_SUBMISSION'),
          timeoutMs: envInteger('MODEL_TIMEOUT_MS_SIMILAR_SUBMISSION', 1500),
          costCeilingMicrosPerThousand: envInteger(
            'MODEL_COST_CEILING_MICROS_PER_THOUSAND_SIMILAR_SUBMISSION',
            50000,
          ),
        },
        ward_candidate: {
          version: envValue('MODEL_VERSION_WARD_CANDIDATE'),
          timeoutMs: envInteger('MODEL_TIMEOUT_MS_WARD_CANDIDATE', 1500),
          costCeilingMicrosPerThousand: envInteger(
            'MODEL_COST_CEILING_MICROS_PER_THOUSAND_WARD_CANDIDATE',
            50000,
          ),
        },
        moderation_routing: {
          version: envValue('MODEL_VERSION_MODERATION_ROUTING'),
          timeoutMs: envInteger('MODEL_TIMEOUT_MS_MODERATION_ROUTING', 30000),
          costCeilingMicrosPerThousand: envInteger(
            'MODEL_COST_CEILING_MICROS_PER_THOUSAND_MODERATION_ROUTING',
            100000,
          ),
        },
        budget_line_extraction: {
          version: envValue('MODEL_VERSION_BUDGET_LINE_EXTRACTION'),
          timeoutMs: envInteger('MODEL_TIMEOUT_MS_BUDGET_LINE_EXTRACTION', 1500),
          costCeilingMicrosPerThousand: envInteger(
            'MODEL_COST_CEILING_MICROS_PER_THOUSAND_BUDGET_LINE_EXTRACTION',
            500000,
          ),
        },
      },
      // The harness measures a version before promotion, so the measured capability is enabled for
      // this config object only. The production flag is unchanged (`C-069`).
      featureFlags: { ward_candidate_suggestions: true },
    });
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  const requests: ModelRequestCompletedEvent[] = [];
  const fallbacks: ModelFallbackTriggeredEvent[] = [];
  const auditRecords: InferenceAuditEvent[] = [];

  const gateway = createInferenceGateway({
    config,
    telemetry: {
      modelRequestCompleted: (event) => {
        requests.push(event);
      },
      modelFallbackTriggered: (event) => {
        fallbacks.push(event);
      },
    },
    audit: {
      record: (event) => {
        auditRecords.push(event);
      },
    },
  });

  const evaluationId = mintEvaluationId();
  const run = await runWardCandidateEvaluation(
    {
      gateway,
      store: createJsonFileEvaluationStore(resolve(parsed.runsDirectory)),
      metric: wardCandidateCapability.metric,
      modelVersion: config.capabilities.ward_candidate.version,
      newEvaluationId: () => evaluationId,
      now: () => new Date(),
    },
    set,
  );

  const evaluation = run.evaluation;
  const percent = (evaluation.result * 100).toFixed(1);
  console.log(`Evaluation ${evaluation.id}`);
  console.log(`  capability   ${evaluation.capability} ${evaluation.modelVersion}`);
  console.log(
    `  measured     ${evaluation.metric} ${percent}% over ${evaluation.datasetSize} cases`,
  );
  console.log(
    `  bar          ${(evaluation.threshold * 100).toFixed(1)}% over ${wardCandidateCapability.metric.minimumDatasetSize}`,
  );
  console.log(`  passed       ${evaluation.passed ? 'yes' : 'NO'}`);
  console.log(
    `  requests     ${requests.length}, fallbacks ${fallbacks.length}, audit records ${auditRecords.length}`,
  );
  console.log(`  artefact     ${resolve(parsed.runsDirectory, `${evaluation.id}.json`)}`);
  if (run.failingCases.length > 0) {
    console.log(`  failing cases (${run.failingCases.length}):`);
    for (const failing of run.failingCases) {
      console.log(
        `    ${failing.caseId} expected ${failing.expectedWardId ?? 'nothing'} got ${failing.topWardId ?? 'nothing'} (${failing.outcome}${failing.reasonCode === null ? '' : `, ${failing.reasonCode}`})`,
      );
    }
  }
  if (evaluation.datasetSize < wardCandidateCapability.metric.minimumDatasetSize) {
    console.log(
      `  note: ${evaluation.datasetSize} cases is below the ${wardCandidateCapability.metric.minimumDatasetSize} NFR-051 requires; the run cannot pass.`,
    );
  }

  return evaluation.passed ? 0 : 1;
}

process.exitCode = await main();
