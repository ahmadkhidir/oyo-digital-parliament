/**
 * The inference gateway (`C-078`).
 *
 * One function carries every rule the contract puts between a caller and a model provider:
 *
 * 1. the capability must be one of `C-078`'s four and registered in this build;
 * 2. the envelope must name its caller and a correlation identifier;
 * 3. the feature flag must be on — every capability starts off (`release.md`);
 * 4. the payload is rebuilt from the capability's allow-list and refused if a telephone number
 *    survives (`NFR-045`);
 * 5. the capability's own payload rules run;
 * 6. the spend ceiling must not already be reached (`C-078` `RATE_LIMITED`);
 * 7. the pinned version, timeout and ceiling replace whatever the caller sent;
 * 8. the adapter runs inside the deadline;
 * 9. a raw answer is accepted only if it validates exactly; otherwise there is no result.
 *
 * Every finished call reports `EVT-038`; every non-`ok` outcome also reports `EVT-041`. The
 * deterministic fallback is the caller's, and the gateway hands it nothing to work with.
 *
 * @module gateway/invoke
 */
import { createHttpModelAdapter } from '../adapters/http/adapter.ts';
import { noneModelAdapter } from '../adapters/none/adapter.ts';
import type { ModelAdapter, ModelAdapterResult, ModelUsage } from '../adapters/types.ts';
import type { WardCandidateResult } from '../capabilities/ward_candidate/index.ts';
import type { InferenceConfig } from '../config/index.ts';
import { callCostMicros } from '../cost/cost.ts';
import { createCostLedger, type CostLedger } from '../cost/ledger.ts';
import { deidentify } from '../deidentification/deidentify.ts';
import type { InferenceTelemetry } from '../telemetry/index.ts';
import type { InferenceAuditPort } from './audit.ts';
import type {
  CapabilityName,
  InferenceError,
  InferenceOutcome,
  InvokeRequest,
  InvokeResult,
} from './contract.ts';
import { emptyOutcome, okOutcome, refusedCall } from './outcome.ts';
import { lookupCapability, type RegisteredCapability } from './registry.ts';

/** What the composition root supplies to the gateway. */
export interface GatewayDependencies {
  readonly config: InferenceConfig;
  /** `EVT-038` and `EVT-041`; an emitter failure never fails the call. */
  readonly telemetry: InferenceTelemetry;
  /** The audit writer; receives the payload shape and every policy refusal. */
  readonly audit: InferenceAuditPort;
  /** The clock used for latency and the spend window. Defaults to wall time. */
  readonly now?: () => number;
  /** Injected for tests; production uses Node's native `fetch`. */
  readonly fetch?: typeof fetch;
}

/** The gateway surface. There is no second way to reach an adapter. */
export interface InferenceGateway {
  /**
   * Runs one capability call.
   *
   * `ward_candidate` is the only capability this release registers, so its result is the only one
   * an `ok` answer can carry. The other three answer `CAPABILITY_UNAVAILABLE` until their own
   * release registers them.
   */
  invoke(request: InvokeRequest): Promise<InvokeResult<WardCandidateResult>>;
}

const CORRELATION_ID_PATTERN = /^req_[0-9A-Z]{4,32}$/;
const COMPONENT_PATTERN = /^[a-z][a-z0-9_]{1,59}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Builds the adapter the config selects. Called once, at composition. */
function selectAdapter(config: InferenceConfig, fetchImpl: typeof fetch | undefined): ModelAdapter {
  if (config.provider !== 'http') return noneModelAdapter;
  return createHttpModelAdapter({
    url: config.apiUrl ?? '',
    apiKey: config.apiKey ?? '',
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  });
}

/** A validation refusal, shaped with the `C-001` field reasons. */
function validationFailure(
  cause: string,
  message: string,
  fields: Readonly<Record<string, string>>,
): InvokeResult<never> {
  return refusedCall({ code: 'VALIDATION_FAILED', cause, message, fields });
}

/** The capability's answer could not be accepted. No partial result survives this. */
function unavailable(
  facts: Parameters<typeof emptyOutcome>[0],
  outcome: Exclude<InferenceOutcome, 'ok'>,
  cause: string,
  message: string,
): InvokeResult<never> {
  const error: InferenceError = { code: 'CAPABILITY_UNAVAILABLE', cause, message };
  return emptyOutcome(facts, outcome, error);
}

/** Emits one telemetry event, swallowing a sink failure (`C-089`). */
async function emit(run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
  } catch {
    // Analytics never fails the call that produced the event.
  }
}

/** Records one audit event, swallowing a writer failure; the refusal still stands. */
async function audit(run: () => void | Promise<void>): Promise<void> {
  try {
    await run();
  } catch {
    // The caller's audit writer buffers and retries; the gateway does not lose the answer over it.
  }
}

/** Names the pinned envelope fields whose caller-supplied value was replaced. */
function rewrittenFields(
  request: InvokeRequest,
  pin: InferenceConfig['capabilities'][CapabilityName],
): string[] {
  const rewritten: string[] = [];
  if (request.modelVersion !== undefined && request.modelVersion !== pin.version) {
    rewritten.push('modelVersion');
  }
  if (request.timeoutMs !== undefined && request.timeoutMs !== pin.timeoutMs) {
    rewritten.push('timeoutMs');
  }
  if (
    request.costCeilingMicrosPerThousand !== undefined &&
    request.costCeilingMicrosPerThousand !== pin.costCeilingMicrosPerThousand
  ) {
    rewritten.push('costCeilingMicrosPerThousand');
  }
  return rewritten;
}

/**
 * Validates the envelope's caller block.
 *
 * @returns The correlation identifier, or a refusal.
 */
function readCaller(
  request: InvokeRequest,
):
  | { readonly ok: true; readonly correlationId: string }
  | { readonly ok: false; readonly result: InvokeResult<never> } {
  if (!isRecord(request.caller)) {
    return {
      ok: false,
      result: validationFailure(
        'CALLER_INVALID',
        'The request must name its calling component and a correlation identifier.',
        { caller: 'REQUIRED' },
      ),
    };
  }
  const correlationId = request.caller.correlationId;
  if (typeof correlationId !== 'string' || correlationId === '') {
    return {
      ok: false,
      result: validationFailure('CORRELATION_ID_MISSING', 'A correlation identifier is required.', {
        correlationId: 'REQUIRED',
      }),
    };
  }
  if (!CORRELATION_ID_PATTERN.test(correlationId)) {
    return {
      ok: false,
      result: validationFailure(
        'CORRELATION_ID_INVALID',
        'The correlation identifier is not in the C-001 form.',
        { correlationId: 'PATTERN_MISMATCH' },
      ),
    };
  }
  const component = request.caller.component;
  if (typeof component !== 'string' || !COMPONENT_PATTERN.test(component)) {
    return {
      ok: false,
      result: validationFailure(
        'COMPONENT_INVALID',
        'The request must name its calling component.',
        { component: 'REQUIRED' },
      ),
    };
  }
  return { ok: true, correlationId };
}

/** Maps an adapter failure onto the gateway's outcome and declared cause. */
function adapterFailure(
  capability: RegisteredCapability,
  result: Extract<ModelAdapterResult, { outcome: 'timeout' | 'refused' | 'error' }>,
  timedOut: boolean,
): {
  readonly outcome: Exclude<InferenceOutcome, 'ok'>;
  readonly cause: string;
  readonly message: string;
} {
  if (timedOut || result.outcome === 'timeout') {
    return {
      outcome: 'timeout',
      cause: 'TIMEOUT',
      message: `${capability.name} did not answer before its pinned timeout; the deterministic path runs.`,
    };
  }
  if (result.outcome === 'refused') {
    return {
      outcome: 'refused',
      cause: result.cause,
      message: `${capability.name} was refused by the provider; the deterministic path runs.`,
    };
  }
  return {
    outcome: 'error',
    cause: result.cause,
    message: `${capability.name} could not be answered; the deterministic path runs.`,
  };
}

function usageOf(result: ModelAdapterResult): ModelUsage | null {
  return result.usage;
}

/**
 * Runs one capability call.
 *
 * @param deps - Configuration, telemetry, audit, clock and adapter construction.
 * @param request - The `C-078` envelope.
 */
async function runInvoke(
  deps: GatewayDependencies,
  adapter: ModelAdapter,
  ledger: CostLedger,
  request: InvokeRequest,
): Promise<InvokeResult<WardCandidateResult>> {
  const now = deps.now ?? Date.now;
  const startedAt = now();

  if (!isRecord(request)) {
    return validationFailure('REQUEST_INVALID', 'The request must be an object.', {
      request: 'REQUIRED',
    });
  }

  const lookup = lookupCapability(String(request.capability));
  if (lookup.kind === 'unknown') {
    return validationFailure('CAPABILITY_UNKNOWN', 'The capability is not one C-078 declares.', {
      capability: 'ENUM_MISMATCH',
    });
  }

  const caller = readCaller(request);
  if (!caller.ok) return caller.result;

  if (!isRecord(request.payload)) {
    return validationFailure('PAYLOAD_INVALID', 'The payload must be an object.', {
      payload: 'REQUIRED',
    });
  }

  const pin =
    deps.config.capabilities[lookup.kind === 'registered' ? lookup.capability.name : lookup.name];
  const baseFacts = {
    capability: lookup.kind === 'registered' ? lookup.capability.name : lookup.name,
    modelVersion: pin.version,
    latencyMs: 0,
    costMicros: 0,
    removedFields: [] as readonly string[],
  };

  if (lookup.kind === 'unbuilt') {
    return unavailable(
      baseFacts,
      'disabled',
      'CAPABILITY_DISABLED',
      `${lookup.name} is not carried by this build; the deterministic path runs.`,
    );
  }

  const capability = lookup.capability;

  if (!pin.flagEnabled) {
    await emit(() =>
      deps.telemetry.modelFallbackTriggered({
        capability: capability.name,
        reasonCode: 'CAPABILITY_DISABLED',
        correlationId: caller.correlationId,
      }),
    );
    return unavailable(
      baseFacts,
      'disabled',
      'CAPABILITY_DISABLED',
      `${capability.name} is switched off; the deterministic path runs.`,
    );
  }

  const identified = deidentify(capability.name, request.payload);
  if (!identified.ok) {
    const cause = identified.cause;
    await audit(() =>
      deps.audit.record({
        kind: 'policy_violation',
        capability: capability.name,
        correlationId: caller.correlationId,
        cause,
        offendingFields: identified.offendingFields,
        removedFields: identified.removedFields,
        payloadShapeDigest: identified.shapeDigest,
      }),
    );
    return refusedCall({
      code: 'POLICY_VIOLATION',
      cause,
      message:
        cause === 'IDENTIFIER_PRESENT'
          ? 'The payload carries what looks like a telephone number; the call was not dispatched.'
          : 'The payload carries a value the boundary cannot prove free of identifiers; the call was not dispatched.',
      fields: Object.fromEntries(
        identified.offendingFields.map((field) => [field, 'PATTERN_MISMATCH']),
      ),
    });
  }

  const payload = capability.readPayload(identified.payload);
  if (!payload.ok) {
    return validationFailure(
      'PAYLOAD_INVALID',
      `${capability.name} received a payload its contract does not accept.`,
      payload.fields,
    );
  }

  await audit(() =>
    deps.audit.record({
      kind: 'payload_shape',
      capability: capability.name,
      correlationId: caller.correlationId,
      modelVersion: pin.version,
      payloadShapeDigest: identified.shapeDigest,
      removedFields: identified.removedFields,
      rewrittenFields: rewrittenFields(request, pin),
    }),
  );

  const spend = ledger.check(capability.name, pin.costCeilingMicrosPerThousand);
  if (!spend.allowed) {
    await emit(() =>
      deps.telemetry.modelFallbackTriggered({
        capability: capability.name,
        reasonCode: 'SPEND_CEILING_REACHED',
        correlationId: caller.correlationId,
      }),
    );
    return refusedCall({
      code: 'RATE_LIMITED',
      cause: 'SPEND_CEILING_REACHED',
      message: `${capability.name} reached its spend ceiling for this window.`,
      retryAfterSeconds: spend.retryAfterSeconds,
    });
  }

  const controller = new AbortController();
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, pin.timeoutMs);

  let answer: ModelAdapterResult;
  try {
    answer = await adapter.send({
      capability: capability.name,
      modelVersion: pin.version,
      instructionVersion: capability.instructionVersion,
      instruction: capability.instruction,
      payload: identified.payload,
      timeoutMs: pin.timeoutMs,
      signal: controller.signal,
    });
  } catch {
    // An adapter is not supposed to throw; if one does, the capability is unavailable.
    answer = { outcome: 'error', cause: 'PROVIDER_UNAVAILABLE', usage: null };
  } finally {
    clearTimeout(deadline);
  }

  const costMicros = callCostMicros(usageOf(answer), pin.costCeilingMicrosPerThousand);
  ledger.record(capability.name, costMicros);

  const facts = {
    capability: capability.name,
    modelVersion: pin.version,
    latencyMs: Math.max(0, Math.round(now() - startedAt)),
    costMicros,
    removedFields: identified.removedFields,
  };

  let result: InvokeResult<WardCandidateResult>;
  if (answer.outcome === 'ok' && !timedOut) {
    const read = capability.readResult(answer.raw, payload.value);
    result =
      read === null
        ? unavailable(
            facts,
            'error',
            'MALFORMED_OUTPUT',
            `${capability.name} returned an answer that does not meet its result contract; nothing is used.`,
          )
        : okOutcome(facts, read as WardCandidateResult);
  } else {
    const failure = adapterFailure(
      capability,
      timedOut && answer.outcome === 'ok'
        ? { outcome: 'timeout', cause: 'TIMEOUT', usage: answer.usage }
        : (answer as Extract<ModelAdapterResult, { outcome: 'timeout' | 'refused' | 'error' }>),
      timedOut,
    );
    result = unavailable(facts, failure.outcome, failure.cause, failure.message);
  }

  await emit(() =>
    deps.telemetry.modelRequestCompleted({
      capability: capability.name,
      latencyMs: facts.latencyMs,
      modelVersion: facts.modelVersion,
      outcome: result.response?.outcome ?? 'error',
      costMicros: facts.costMicros,
      correlationId: caller.correlationId,
    }),
  );

  if (!result.ok) {
    await emit(() =>
      deps.telemetry.modelFallbackTriggered({
        capability: capability.name,
        reasonCode: result.error.cause,
        correlationId: caller.correlationId,
      }),
    );
  }

  return result;
}

/**
 * Builds the gateway.
 *
 * The adapter is selected once from the pinned configuration and closed over, so no caller can
 * reach a provider except through `invoke`.
 *
 * @param deps - Configuration, telemetry, audit, clock and optional fetch.
 */
export function createInferenceGateway(deps: GatewayDependencies): InferenceGateway {
  const adapter = selectAdapter(deps.config, deps.fetch);
  const ledger = createCostLedger({
    now: deps.now ?? Date.now,
    windowSeconds: deps.config.windowSeconds,
  });

  return {
    invoke: (request: InvokeRequest) => runInvoke(deps, adapter, ledger, request),
  };
}
