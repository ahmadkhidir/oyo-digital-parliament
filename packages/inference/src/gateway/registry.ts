/**
 * The capability registry (`C-078`, `packages/inference/AGENTS.md` Structure).
 *
 * A capability is reachable only when it is registered here with its full pinned contract. The
 * gateway reads every capability through this table, so an unknown name and a declared-but-unbuilt
 * capability are answered differently: the first is a validation failure, the second is unavailable
 * because this build does not carry it.
 *
 * @module gateway/registry
 */
import {
  type CapabilityDefinition,
  type CapabilityMetric,
  type PayloadRead,
} from '../capabilities/definition.ts';
import { wardCandidateCapability } from '../capabilities/ward_candidate/index.ts';
import type { AllowedValue } from '../deidentification/deidentify.ts';
import { CAPABILITY_NAMES, type CapabilityName } from './contract.ts';

/** A capability after type erasure, so the gateway can hold mixed result shapes in one table. */
export interface RegisteredCapability {
  readonly name: CapabilityName;
  readonly flag: string;
  readonly instructionVersion: string;
  readonly instruction: string;
  readonly fallback: string;
  readonly metric: CapabilityMetric;
  readPayload(payload: Readonly<Record<string, AllowedValue>>): PayloadRead<unknown>;
  readResult(raw: unknown, payload: unknown): unknown | null;
}

/**
 * Erases one definition's result type for storage.
 *
 * The two reads stay bound to the capability whose payload reader produced the value, so the cast
 * inside `readResult` cannot see a payload from another capability.
 */
function register<Payload, Result>(
  definition: CapabilityDefinition<Payload, Result>,
): RegisteredCapability {
  return {
    name: definition.name,
    flag: definition.flag,
    instructionVersion: definition.instructionVersion,
    instruction: definition.instruction,
    fallback: definition.fallback,
    metric: definition.metric,
    readPayload: (payload) => definition.readPayload(payload),
    readResult: (raw, payload) => definition.readResult(raw, payload as Payload),
  };
}

/** Every capability this build carries. Adding one is a specification change with its own bar. */
const REGISTERED: ReadonlyMap<CapabilityName, RegisteredCapability> = new Map([
  ['ward_candidate', register(wardCandidateCapability)],
]);

/** The names this build can reach, for diagnostics that never print a payload. */
export const REGISTERED_CAPABILITY_NAMES: readonly CapabilityName[] = [...REGISTERED.keys()];

/**
 * Resolves a capability name.
 *
 * @returns The registered capability, `null` for a valid name this build does not carry, or
 *   `undefined` for a name outside `C-078`'s four.
 */
export function lookupCapability(
  name: string,
):
  | { readonly kind: 'registered'; readonly capability: RegisteredCapability }
  | { readonly kind: 'unbuilt'; readonly name: CapabilityName }
  | { readonly kind: 'unknown' } {
  if (!(CAPABILITY_NAMES as readonly string[]).includes(name)) return { kind: 'unknown' };
  const capability = REGISTERED.get(name as CapabilityName);
  if (capability === undefined) return { kind: 'unbuilt', name: name as CapabilityName };
  return { kind: 'registered', capability };
}
