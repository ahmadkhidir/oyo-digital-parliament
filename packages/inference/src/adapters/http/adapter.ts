/**
 * The HTTP model adapter (`C-078`, `NFR-045`).
 *
 * It posts the de-identified payload with the pinned model version and the versioned instruction,
 * and maps every transport answer into the adapter vocabulary. It never logs or echoes a request or
 * response body, and it never retries: the gateway's deadline is the whole time budget, and the
 * caller's deterministic path is the fallback.
 *
 * The fetch implementation is injectable so no test reaches a real endpoint. Production passes
 * Node's native `fetch`.
 *
 * @module adapters/http/adapter
 */
import type {
  ModelAdapter,
  ModelAdapterRequest,
  ModelAdapterResult,
  ModelUsage,
} from '../types.ts';

/** Where the adapter sends and how it authenticates. */
export interface HttpModelAdapterOptions {
  readonly url: string;
  readonly apiKey: string;
  /** Injected for tests; defaults to the runtime's native `fetch`. */
  readonly fetch?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads provider usage, tolerating a provider that reports none. */
function readUsage(value: unknown): ModelUsage | null {
  if (!isRecord(value)) return null;
  const units = value.units;
  if (typeof units !== 'number' || !Number.isFinite(units) || units < 0) return null;
  return { units };
}

function failure(
  outcome: 'timeout' | 'refused' | 'error',
  cause: string,
  usage: ModelUsage | null,
): ModelAdapterResult {
  return { outcome, cause, usage };
}

/**
 * Builds the HTTP adapter.
 *
 * @param options - Endpoint, credential and optional fetch implementation.
 * @returns The adapter the gateway calls. It does not throw on a provider problem.
 */
export function createHttpModelAdapter(options: HttpModelAdapterOptions): ModelAdapter {
  const fetchImpl = options.fetch ?? fetch;

  return {
    async send(request: ModelAdapterRequest): Promise<ModelAdapterResult> {
      let response: Response;
      try {
        response = await fetchImpl(options.url, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify({
            model: request.modelVersion,
            capability: request.capability,
            instructionVersion: request.instructionVersion,
            instruction: request.instruction,
            payload: request.payload,
          }),
          signal: request.signal,
        });
      } catch (error) {
        if (request.signal.aborted || (error as { name?: string }).name === 'AbortError') {
          return failure('timeout', 'TIMEOUT', null);
        }
        return failure('error', 'PROVIDER_UNAVAILABLE', null);
      }

      // A 429 is the provider's own limit; the capability is unavailable for this call, and the
      // gateway does not retry inside the timeout.
      if (response.status === 429) return failure('error', 'PROVIDER_RATE_LIMITED', null);
      // 422 is how the provider states it will not answer this content.
      if (response.status === 422) return failure('refused', 'PROVIDER_REFUSED', null);
      if (!response.ok) return failure('error', 'PROVIDER_UNAVAILABLE', null);

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return failure('error', 'MALFORMED_OUTPUT', null);
      }
      if (!isRecord(body)) return failure('error', 'MALFORMED_OUTPUT', null);
      if (body.refused === true) return failure('refused', 'PROVIDER_REFUSED', null);

      const usage = readUsage(body.usage);
      if (!('output' in body)) return failure('error', 'MALFORMED_OUTPUT', usage);
      return { outcome: 'ok', raw: body.output, usage };
    },
  };
}
