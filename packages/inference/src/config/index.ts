/**
 * The pinned per-capability configuration (`C-078`, `NFR-050` to `NFR-053`).
 *
 * The gateway never reads the environment. The composition root hands this package the model slice
 * of the platform configuration and the resolved feature flags, and this module validates the slice
 * once, applies the launch defaults and freezes it. From then on every call reads the same pinned
 * version, timeout, ceiling and flag; a caller cannot widen one and a capability cannot borrow
 * another's contract.
 *
 * The feature flag is off by default (`release.md`): an environment that never mentions the flag
 * runs the deterministic path, which is the behaviour `FEAT-002` already provides.
 *
 * @module config
 */
import { CAPABILITY_FLAGS } from '../capabilities/definition.ts';
import { CAPABILITY_NAMES, type CapabilityName } from '../gateway/contract.ts';

/** The model-provider setting, matching `MODEL_PROVIDER` in the platform schema. */
export type ModelProvider = 'none' | 'http';

/** One capability's pinned values. */
export interface CapabilityPinning {
  /** The pinned model version; `unpinned` only while the capability is off and no provider runs. */
  readonly version: string;
  readonly timeoutMs: number;
  readonly costCeilingMicrosPerThousand: number;
  /** Whether the capability's feature flag is enabled. Off at launch. */
  readonly flagEnabled: boolean;
  /** Where the harness reads this capability's fixed labelled set. */
  readonly labelledSetPath: string;
}

/** The frozen inference configuration. */
export interface InferenceConfig {
  readonly provider: ModelProvider;
  /** Present only when `provider` is `http`. */
  readonly apiUrl: string | null;
  /** Never logged, never serialised. Present only when `provider` is `http`. */
  readonly apiKey: string | null;
  /** The processing region named in the privacy notice (`NFR-045`). */
  readonly region: string | null;
  /** The fixed window the spend ceiling is counted over. */
  readonly windowSeconds: number;
  readonly capabilities: Readonly<Record<CapabilityName, CapabilityPinning>>;
}

/** One capability's caller-supplied pin, as the platform configuration holds it. */
export interface CapabilityPinningInput {
  readonly version: string | null;
  readonly timeoutMs: number;
  readonly costCeilingMicrosPerThousand: number;
}

/** What the composition root supplies. */
export interface InferenceConfigInput {
  readonly provider: ModelProvider;
  readonly apiUrl?: string | null;
  readonly apiKey?: string | null;
  readonly region?: string | null;
  readonly windowSeconds?: number;
  readonly capabilities: Readonly<Record<CapabilityName, CapabilityPinningInput>>;
  /** Resolved feature flags, keyed as `release.md` names them. An absent flag is off. */
  readonly featureFlags?: Readonly<Record<string, boolean>>;
}

/** A boot-time configuration failure. Names the field and the rule, never a secret value. */
export class InferenceConfigurationError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid inference configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
    this.name = 'InferenceConfigurationError';
    this.problems = problems;
  }
}

const DEFAULT_WINDOW_SECONDS = 60;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 30_000;

/** The labelled set's path, relative to the package root, as `packages/inference/AGENTS.md` lays it out. */
function labelledSetPath(capability: CapabilityName): string {
  return `eval/${capability}/labelled-set.json`;
}

/**
 * Validates and freezes the pinned configuration.
 *
 * @param input - The model slice and resolved flags from the platform configuration.
 * @returns The frozen configuration.
 * @throws InferenceConfigurationError when a pin is missing, malformed or out of range. No partial
 *   configuration is returned, and a message never repeats a credential.
 */
export function defineInferenceConfig(input: InferenceConfigInput): InferenceConfig {
  const problems: string[] = [];

  if (input.provider !== 'none' && input.provider !== 'http') {
    problems.push('provider must be "none" or "http"');
  }
  if (input.provider === 'http') {
    if (typeof input.apiUrl !== 'string' || input.apiUrl.trim() === '') {
      problems.push('apiUrl is required when a model provider is configured');
    }
    if (typeof input.apiKey !== 'string' || input.apiKey.trim() === '') {
      problems.push('apiKey is required when a model provider is configured');
    }
    if (typeof input.region !== 'string' || input.region.trim() === '') {
      problems.push('region is required when a model provider is configured (NFR-045)');
    }
  }

  const windowSeconds = input.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 3600) {
    problems.push('windowSeconds must be a whole number between 1 and 3600');
  }

  const capabilities = {} as Record<CapabilityName, CapabilityPinning>;
  for (const capability of CAPABILITY_NAMES) {
    const pin = input.capabilities[capability];
    if (pin === undefined) {
      problems.push(`${capability} has no pinned configuration`);
      continue;
    }
    if (
      !Number.isInteger(pin.timeoutMs) ||
      pin.timeoutMs < MIN_TIMEOUT_MS ||
      pin.timeoutMs > MAX_TIMEOUT_MS
    ) {
      problems.push(`${capability}.timeoutMs must be a whole number between 100 and 30000`);
    }
    if (
      !Number.isInteger(pin.costCeilingMicrosPerThousand) ||
      pin.costCeilingMicrosPerThousand < 1
    ) {
      problems.push(`${capability}.costCeilingMicrosPerThousand must be a positive whole number`);
    }

    const flagEnabled = input.featureFlags?.[CAPABILITY_FLAGS[capability]] === true;
    // A capability that can run must say which version was measured. A disabled one may be
    // unpinned, because it cannot be invoked until its flag is enabled.
    const version = typeof pin.version === 'string' ? pin.version.trim() : '';
    if (version === '' && flagEnabled) {
      problems.push(`${capability}.version is required before the capability can run`);
    }

    capabilities[capability] = Object.freeze({
      version: version === '' ? 'unpinned' : version,
      timeoutMs: pin.timeoutMs,
      costCeilingMicrosPerThousand: pin.costCeilingMicrosPerThousand,
      flagEnabled,
      labelledSetPath: labelledSetPath(capability),
    });
  }

  if (problems.length > 0) throw new InferenceConfigurationError(problems);

  return Object.freeze({
    provider: input.provider,
    apiUrl: input.provider === 'http' ? (input.apiUrl ?? null) : null,
    apiKey: input.provider === 'http' ? (input.apiKey ?? null) : null,
    region: input.provider === 'http' ? (input.region ?? null) : null,
    windowSeconds,
    capabilities: Object.freeze(capabilities),
  });
}
