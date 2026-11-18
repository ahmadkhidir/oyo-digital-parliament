/**
 * The object-key scheme.
 *
 * An artefact is written once under a key that states its kind, its scope and its generation time,
 * in that order, so a listing sorts by kind and generation and a correction is a new key rather than
 * an overwrite. The scheme carries opaque identifiers and a timestamp only: no name, no telephone
 * number, no member identifier, no ward description and no free text (`packages/platform/AGENTS.md`
 * Discipline).
 *
 *  - `exports/request/<dataRequestId>/<stamp>`
 *  - `report-cards/<quarter>/<stamp>`
 *  - `handover/<stamp>/<generation>`
 *  - `evaluations/<capability>/<modelEvaluationId>/<name>`
 *
 * @module adapters/storage/s3/keys
 */
import { isIdentifier } from '../../../ids/ids.ts';
import { MODEL_CAPABILITIES, type ModelCapability } from '../../../config/schema.ts';

/** The characters a file name inside an artefact key may use. */
const SAFE_NAME = /^[a-z0-9][a-z0-9._-]{0,80}$/;

/** The quarter form `C-001` and the report card use. */
const QUARTER = /^[0-9]{4}-Q[1-4]$/;

/** `YYYYMMDDTHHMMSSZ`, so keys sort lexicographically by generation. */
function generationStamp(instant: Date): string {
  return instant
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[-:]/g, '');
}

/** A required identifier-shaped value. */
function requireIdentifier(value: string, label: string, prefixes: readonly string[]): string {
  if (!isIdentifier(value) || !prefixes.includes(value.slice(0, 3))) {
    throw new Error(`${label} is not a record identifier of the expected kind`);
  }
  return value;
}

/**
 * The key for one member's data export (`C-035`, `C-036`).
 *
 * A re-export is a new object under a later stamp; the earlier file stays readable until its
 * lifecycle rule removes it.
 *
 * @param input - The data-request id and the moment the file was generated.
 */
export function memberExportKey(input: {
  readonly dataRequestId: string;
  readonly generatedAt: Date;
}): string {
  const id = requireIdentifier(input.dataRequestId, 'dataRequestId', ['drq']);
  return `exports/request/${id}/${generationStamp(input.generatedAt)}`;
}

/**
 * The key for one published quarterly report card (`C-084`, `C-061`).
 *
 * @param input - The quarter (`YYYY-Qn`) and generation instant.
 */
export function reportCardKey(input: {
  readonly quarter: string;
  readonly generatedAt: Date;
}): string {
  if (!QUARTER.test(input.quarter)) {
    throw new Error('quarter must be in the YYYY-Qn form');
  }
  return `report-cards/${input.quarter}/${generationStamp(input.generatedAt)}`;
}

/**
 * The key for the handover snapshot (`C-088`).
 *
 * @param input - The generation instant and a positive generation counter, because two snapshots
 *   may be generated inside one second and neither may overwrite the other.
 */
export function handoverSnapshotKey(input: {
  readonly generatedAt: Date;
  readonly generation: number;
}): string {
  if (!Number.isSafeInteger(input.generation) || input.generation < 1) {
    throw new Error('handover generation must be a positive integer');
  }
  return `handover/${generationStamp(input.generatedAt)}/${input.generation}`;
}

/**
 * The key for one evaluation artefact (`packages/inference` harness).
 *
 * @param input - The capability, the stored ModelEvaluation id and a safe file name.
 */
export function evaluationArtefactKey(input: {
  readonly capability: ModelCapability;
  readonly modelEvaluationId: string;
  readonly name: string;
}): string {
  if (!MODEL_CAPABILITIES.includes(input.capability)) {
    throw new Error('capability is not one of the four the gateway serves');
  }
  const id = requireIdentifier(input.modelEvaluationId, 'modelEvaluationId', ['mev']);
  if (!SAFE_NAME.test(input.name)) {
    throw new Error('artefact name must be a lower-case file name without a path');
  }
  return `evaluations/${input.capability}/${id}/${input.name}`;
}
