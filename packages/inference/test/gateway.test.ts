/**
 * The inference gateway (`C-078`, `C-080`, `FEAT-002`, `NFR-045`, `NFR-051`).
 *
 * The suites cover every outcome the contract declares: `ok`, `timeout`, `refused`, `disabled` and
 * `error`, plus the refusals that never reach a provider. Every provider answer is scripted.
 */
import { describe, expect, it } from 'vitest';

import {
  createInferenceGateway,
  defineInferenceConfig,
  type CapabilityName,
  type InferenceConfigInput,
  type InvokeRequest,
  type InvokeResult,
  type WardCandidateResult,
} from '../src/index.ts';
import {
  forbiddenFetch,
  jsonResponse,
  manualClock,
  providerBody,
  recordingAudit,
  recordingTelemetry,
  testConfig,
} from './support.ts';

const CORRELATION_ID = 'req_01J9Z6M2V4';
const TOP = 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM';
const SECOND = 'wrd_01J9Z5B2C3D4E5F6G7H8J9KMP';

function wardRequest(
  payload: unknown = { description: 'Behind Agbowo market, near the express' },
  overrides: Partial<InvokeRequest> = {},
): InvokeRequest {
  return {
    capability: 'ward_candidate',
    caller: { component: 'ward_service', correlationId: CORRELATION_ID },
    payload,
    ...overrides,
  };
}

interface GatewayHarness {
  invoke(request: InvokeRequest): Promise<InvokeResult<WardCandidateResult>>;
  readonly requests: ReturnType<typeof recordingTelemetry>['requests'];
  readonly fallbacks: ReturnType<typeof recordingTelemetry>['fallbacks'];
  readonly auditEvents: ReturnType<typeof recordingAudit>['events'];
  readonly bodies: unknown[];
}

function harness(
  fetchImpl: typeof fetch,
  configOverrides: Partial<InferenceConfigInput> = {},
  now: () => number = () => 0,
): GatewayHarness {
  const telemetry = recordingTelemetry();
  const audit = recordingAudit();
  const bodies: unknown[] = [];
  const wrapped = (async (url: string | URL | Request, init?: RequestInit) => {
    bodies.push(init?.body === undefined ? undefined : JSON.parse(String(init.body)));
    return fetchImpl(url, init);
  }) as typeof fetch;

  const gateway = createInferenceGateway({
    config: testConfig(configOverrides),
    telemetry,
    audit,
    now,
    fetch: wrapped,
  });

  return {
    invoke: (request) => gateway.invoke(request),
    requests: telemetry.requests,
    fallbacks: telemetry.fallbacks,
    auditEvents: audit.events,
    bodies,
  };
}

/** A provider that answers with the given output. */
function answeringProvider(
  output: unknown,
  usage: { units: number } = { units: 10 },
): typeof fetch {
  return (async () => jsonResponse(providerBody(output, usage), 200)) as unknown as typeof fetch;
}

describe('inference gateway', () => {
  it('returns up to three ordered candidates without assigning a ward', async () => {
    const gateway = harness(
      answeringProvider({
        candidates: [
          { wardId: SECOND, confidence: 0.42, rank: 2 },
          { wardId: TOP, confidence: 0.88, rank: 1 },
        ],
      }),
    );

    const result = await gateway.invoke(wardRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.response).toMatchObject({
      capability: 'ward_candidate',
      modelVersion: 'odp-ward-test-1',
      outcome: 'ok',
      removedFields: [],
    });
    expect(result.response.result).toEqual({
      candidates: [
        { wardId: TOP, confidence: 0.88, rank: 1 },
        { wardId: SECOND, confidence: 0.42, rank: 2 },
      ],
    });
    // The result has no field that could record a ward against a member.
    expect(Object.keys(result.response.result ?? {})).toEqual(['candidates']);
    expect(gateway.requests).toHaveLength(1);
    expect(gateway.requests[0]).toMatchObject({
      capability: 'ward_candidate',
      outcome: 'ok',
      correlationId: CORRELATION_ID,
    });
    expect(gateway.fallbacks).toHaveLength(0);
  });

  it('is off by default and never calls a provider', async () => {
    const gateway = harness(forbiddenFetch(), { featureFlags: {} });
    const result = await gateway.invoke(wardRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      cause: 'CAPABILITY_DISABLED',
    });
    expect(result.response?.outcome).toBe('disabled');
    expect(result.response?.result).toBeNull();
    expect(gateway.requests).toHaveLength(0);
    expect(gateway.fallbacks).toEqual([
      {
        capability: 'ward_candidate',
        reasonCode: 'CAPABILITY_DISABLED',
        correlationId: CORRELATION_ID,
      },
    ]);
  });

  it('returns nothing on timeout', async () => {
    const abortingFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    const telemetry = recordingTelemetry();
    const base = testConfig();
    // A 100ms deadline is the shortest configuration the contract permits.
    const fast = createInferenceGateway({
      config: defineInferenceConfig({
        provider: 'http',
        apiUrl: 'https://model.example.test/v1',
        apiKey: 'test-key',
        region: 'ng',
        capabilities: {
          ...base.capabilities,
          ward_candidate: {
            version: 'odp-ward-test-1',
            timeoutMs: 100,
            costCeilingMicrosPerThousand: 50000,
          },
        },
        featureFlags: { ward_candidate_suggestions: true },
      }),
      telemetry,
      audit: recordingAudit(),
      fetch: abortingFetch,
    });

    const result = await fast.invoke(wardRequest());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: 'CAPABILITY_UNAVAILABLE', cause: 'TIMEOUT' });
    expect(result.response?.outcome).toBe('timeout');
    expect(result.response?.result).toBeNull();
    expect(telemetry.requests[0]).toMatchObject({ outcome: 'timeout' });
    expect(telemetry.fallbacks[0]).toMatchObject({ reasonCode: 'TIMEOUT' });
  });

  it('returns nothing when the provider refuses', async () => {
    const gateway = harness((async () =>
      jsonResponse({ refused: true }, 422)) as unknown as typeof fetch);
    const result = await gateway.invoke(wardRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      cause: 'PROVIDER_REFUSED',
    });
    expect(result.response?.outcome).toBe('refused');
    expect(result.response?.result).toBeNull();
    expect(gateway.fallbacks).toHaveLength(1);
  });

  it('returns nothing when the answer does not meet the result contract', async () => {
    const gateway = harness(answeringProvider({ candidates: 'three good ones' }));
    const result = await gateway.invoke(wardRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      cause: 'MALFORMED_OUTPUT',
    });
    expect(result.response?.result).toBeNull();
  });

  it('reports an unavailable provider when none is configured', async () => {
    const gateway = harness(forbiddenFetch(), { provider: 'none' });
    const result = await gateway.invoke(wardRequest());

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      cause: 'PROVIDER_UNAVAILABLE',
    });
    expect(result.response?.outcome).toBe('error');
  });

  it('rejects an unknown capability and a capability this build does not carry', async () => {
    const gateway = harness(forbiddenFetch());

    const unknown = await gateway.invoke({
      ...wardRequest(),
      capability: 'sentiment_analysis' as CapabilityName,
    });
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      cause: 'CAPABILITY_UNKNOWN',
      fields: { capability: 'ENUM_MISMATCH' },
    });
    expect(unknown.response).toBeNull();

    const unbuilt = await gateway.invoke({
      ...wardRequest({ description: 'Agbowo' }),
      capability: 'moderation_routing',
    });
    expect(unbuilt.ok).toBe(false);
    if (unbuilt.ok) return;
    expect(unbuilt.error).toMatchObject({
      code: 'CAPABILITY_UNAVAILABLE',
      cause: 'CAPABILITY_DISABLED',
    });
    expect(unbuilt.response?.outcome).toBe('disabled');
  });

  it('validates the caller, the payload and the capability rules before dispatch', async () => {
    const gateway = harness(forbiddenFetch());

    const noCorrelation = await gateway.invoke({
      ...wardRequest(),
      caller: { component: 'ward_service', correlationId: '' },
    });
    expect(noCorrelation.ok).toBe(false);
    if (noCorrelation.ok) return;
    expect(noCorrelation.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      cause: 'CORRELATION_ID_MISSING',
      fields: { correlationId: 'REQUIRED' },
    });

    const arrayPayload = await gateway.invoke(wardRequest([]));
    expect(arrayPayload.ok).toBe(false);
    if (arrayPayload.ok) return;
    expect(arrayPayload.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      cause: 'PAYLOAD_INVALID',
      fields: { payload: 'REQUIRED' },
    });

    const emptyDescription = await gateway.invoke(wardRequest({ description: ' ' }));
    expect(emptyDescription.ok).toBe(false);
    if (emptyDescription.ok) return;
    expect(emptyDescription.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      cause: 'PAYLOAD_INVALID',
      fields: { description: 'REQUIRED' },
    });
    expect(gateway.bodies).toHaveLength(0);
  });

  it('strips identifiers and reports them without sending a value', async () => {
    const gateway = harness(answeringProvider({ candidates: [] }));
    const result = await gateway.invoke(
      wardRequest({
        description: 'Behind Agbowo market',
        localGovernmentArea: 'Ibadan North',
        fullName: 'Adebayo Ogunlesi',
        telephoneNumber: '+2348031234567',
        memberId: 'mbr_01J9Z5A1B2C3D4E5F6G7H8J9KM',
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.removedFields).toEqual(['fullName', 'memberId', 'telephoneNumber']);
    expect(gateway.bodies).toHaveLength(1);
    const sent = JSON.stringify(gateway.bodies[0]);
    expect(sent).not.toContain('Adebayo');
    expect(sent).not.toContain('2348031234567');
    expect(sent).not.toContain('mbr_');
    expect(sent).toContain('Behind Agbowo market');

    const shape = gateway.auditEvents.find((event) => event.kind === 'payload_shape');
    expect(shape).toMatchObject({
      removedFields: ['fullName', 'memberId', 'telephoneNumber'],
      rewrittenFields: [],
    });
  });

  it('refuses a description carrying a telephone number and audits the refusal', async () => {
    const gateway = harness(forbiddenFetch());
    const result = await gateway.invoke(
      wardRequest({ description: 'Call 0803 123 4567, I will show you the road' }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({
      code: 'POLICY_VIOLATION',
      cause: 'IDENTIFIER_PRESENT',
      fields: { description: 'PATTERN_MISMATCH' },
    });
    expect(result.response).toBeNull();
    expect(gateway.bodies).toHaveLength(0);
    expect(gateway.auditEvents).toEqual([
      expect.objectContaining({
        kind: 'policy_violation',
        capability: 'ward_candidate',
        cause: 'IDENTIFIER_PRESENT',
        offendingFields: ['description'],
      }),
    ]);
  });

  it('trips the spend ceiling and refuses further calls', async () => {
    const gateway = harness(answeringProvider({ candidates: [] }, { units: 1000 }), {
      capabilities: {
        similar_submission: {
          version: null,
          timeoutMs: 1500,
          costCeilingMicrosPerThousand: 50000,
        },
        ward_candidate: {
          version: 'odp-ward-test-1',
          timeoutMs: 1500,
          costCeilingMicrosPerThousand: 1,
        },
        moderation_routing: {
          version: null,
          timeoutMs: 1500,
          costCeilingMicrosPerThousand: 100000,
        },
        budget_line_extraction: {
          version: null,
          timeoutMs: 1500,
          costCeilingMicrosPerThousand: 500000,
        },
      },
    });

    const first = await gateway.invoke(wardRequest());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.response.costMicros).toBe(1);

    const second = await gateway.invoke(wardRequest());
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error).toMatchObject({
      code: 'RATE_LIMITED',
      cause: 'SPEND_CEILING_REACHED',
    });
    expect(second.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(gateway.bodies).toHaveLength(1);
  });

  it('replaces a caller-supplied version, timeout and ceiling from the pinned configuration', async () => {
    const gateway = harness(answeringProvider({ candidates: [] }));
    const result = await gateway.invoke(
      wardRequest(undefined, {
        modelVersion: 'odp-ward-2099-99-9',
        timeoutMs: 999_999,
        costCeilingMicrosPerThousand: 1,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.modelVersion).toBe('odp-ward-test-1');

    const shape = gateway.auditEvents.find((event) => event.kind === 'payload_shape');
    expect(shape).toMatchObject({
      rewrittenFields: ['modelVersion', 'timeoutMs', 'costCeilingMicrosPerThousand'],
    });
  });

  it('reports latency from the injected clock', async () => {
    let current = 100;
    const gateway = harness(answeringProvider({ candidates: [] }), {}, () => {
      current += 20;
      return current;
    });

    const result = await gateway.invoke(wardRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.response.latencyMs).toBeGreaterThan(0);
  });

  it('emits EVT-038 on every finished call and EVT-041 on every fallback', async () => {
    const gateway = harness(answeringProvider({ candidates: [] }));
    const result = await gateway.invoke(wardRequest());
    expect(result.ok).toBe(true);
    expect(gateway.requests).toHaveLength(1);
    expect(Object.keys(gateway.requests[0] ?? {}).sort()).toEqual([
      'capability',
      'correlationId',
      'costMicros',
      'latencyMs',
      'modelVersion',
      'outcome',
    ]);
    expect(gateway.fallbacks).toHaveLength(0);
  });

  it('does not fail a call when the telemetry and audit sinks throw', async () => {
    const gateway = createInferenceGateway({
      config: testConfig(),
      telemetry: {
        modelRequestCompleted: () => {
          throw new Error('analytics down');
        },
        modelFallbackTriggered: () => {
          throw new Error('analytics down');
        },
      },
      audit: {
        record: () => {
          throw new Error('audit down');
        },
      },
      now: manualClock(0).now,
      fetch: answeringProvider({ candidates: [] }),
    });

    const result = await gateway.invoke(wardRequest());
    expect(result.ok).toBe(true);
  });
});
