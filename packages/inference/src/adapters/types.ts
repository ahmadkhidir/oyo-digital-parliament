/**
 * The provider adapter seam (`C-078`, `packages/inference/AGENTS.md` Structure).
 *
 * An adapter transports one de-identified payload and returns the provider's raw answer or a typed
 * failure. It never shapes a prompt, chooses a capability, applies a fallback or decides whether
 * the answer is acceptable — those belong to the gateway and the capability definition.
 *
 * A provider that refuses, times out or fails is reported, never retried here: `C-078` forbids a
 * retry that outlives the timeout, and the caller's deterministic path is what runs next.
 *
 * @module adapters/types
 */
import type { AllowedValue } from '../deidentification/deidentify.ts';
import type { CapabilityName } from '../gateway/contract.ts';

/** One de-identified call, ready to send. */
export interface ModelAdapterRequest {
  readonly capability: CapabilityName;
  readonly modelVersion: string;
  readonly instructionVersion: string;
  readonly instruction: string;
  readonly payload: Readonly<Record<string, AllowedValue>>;
  readonly timeoutMs: number;
  /** Aborted when the gateway's deadline passes, so a slow provider cannot outlive the call. */
  readonly signal: AbortSignal;
}

/** Provider-reported usage, the input to cost accounting. */
export interface ModelUsage {
  /** Billed units (tokens, embeddings or classifications, as the capability counts them). */
  readonly units: number;
}

/** What an adapter reports. A raw answer exists only on `ok`. */
export type ModelAdapterResult =
  | {
      readonly outcome: 'ok';
      readonly raw: unknown;
      readonly usage: ModelUsage | null;
    }
  | {
      readonly outcome: 'timeout' | 'refused' | 'error';
      /** Stable upper-snake token, for example `TIMEOUT` or `PROVIDER_UNAVAILABLE`. */
      readonly cause: string;
      readonly usage: ModelUsage | null;
    };

/** A model provider behind one narrow method. */
export interface ModelAdapter {
  /** @returns The provider's answer or a typed failure; the method does not throw on a transport problem. */
  send(request: ModelAdapterRequest): Promise<ModelAdapterResult>;
}
