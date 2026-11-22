/**
 * Shared test doubles for the inference suites. No test reaches a real provider: every adapter
 * answer is a scripted `Response`, and the clock is moved by the test.
 */
import type {
  InferenceAuditEvent,
  InferenceAuditPort,
  InferenceConfig,
  InferenceConfigInput,
  InferenceTelemetry,
  ModelFallbackTriggeredEvent,
  ModelRequestCompletedEvent,
} from '../src/index.ts';
import { defineInferenceConfig } from '../src/index.ts';

/** A configuration with `ward_candidate` enabled and a provider selected. */
export function testConfig(overrides: Partial<InferenceConfigInput> = {}): InferenceConfig {
  return defineInferenceConfig({
    provider: 'http',
    apiUrl: 'https://model.example.test/v1',
    apiKey: 'test-key-not-a-secret',
    region: 'ng',
    capabilities: {
      similar_submission: {
        version: 'odp-sim-test-1',
        timeoutMs: 1500,
        costCeilingMicrosPerThousand: 50000,
      },
      ward_candidate: {
        version: 'odp-ward-test-1',
        timeoutMs: 1500,
        costCeilingMicrosPerThousand: 50000,
      },
      moderation_routing: {
        version: 'odp-mod-test-1',
        timeoutMs: 1500,
        costCeilingMicrosPerThousand: 100000,
      },
      budget_line_extraction: {
        version: 'odp-budget-test-1',
        timeoutMs: 1500,
        costCeilingMicrosPerThousand: 500000,
      },
    },
    featureFlags: { ward_candidate_suggestions: true },
    ...overrides,
  });
}

/** A telemetry sink that records both events. */
export interface RecordingTelemetry extends InferenceTelemetry {
  readonly requests: ModelRequestCompletedEvent[];
  readonly fallbacks: ModelFallbackTriggeredEvent[];
}

export function recordingTelemetry(): RecordingTelemetry {
  const requests: ModelRequestCompletedEvent[] = [];
  const fallbacks: ModelFallbackTriggeredEvent[] = [];
  return {
    requests,
    fallbacks,
    modelRequestCompleted: (event) => {
      requests.push(event);
    },
    modelFallbackTriggered: (event) => {
      fallbacks.push(event);
    },
  };
}

/** An audit sink that records every event. */
export interface RecordingAudit extends InferenceAuditPort {
  readonly events: InferenceAuditEvent[];
}

export function recordingAudit(): RecordingAudit {
  const events: InferenceAuditEvent[] = [];
  return {
    events,
    record: (event) => {
      events.push(event);
    },
  };
}

/** A provider answer body. */
export function providerBody(
  output: unknown,
  usage: { units: number } = { units: 10 },
): Record<string, unknown> {
  return { output, usage };
}

/** A JSON response with the given status. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch that must never be called. */
export function forbiddenFetch(): typeof fetch {
  return (async () => {
    throw new Error('a test reached the provider when it should not have');
  }) as unknown as typeof fetch;
}

/** A clock the test moves explicitly. */
export interface ManualClock {
  now(): number;
  advance(ms: number): void;
}

export function manualClock(start = 1_000_000): ManualClock {
  let current = start;
  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}
