/**
 * Reading the ward reference (`C-009`, `FEAT-002`, `NFR-002`).
 *
 * The read is public and takes no authority over a member's description: it lists the wards the
 * platform records, filtered by local government area, so `Ward Confirmation` and the commitment
 * register can render a picker. When the reference cannot be read the caller is told
 * `SERVICE_DEGRADED` and offers the free-text field alone, which `FEAT-002` makes sufficient.
 */
import {
  wardFailure,
  type Ward,
  type WardCaller,
  type WardFailure,
  type WardFieldReason,
} from '../entities.ts';
import { readLocalGovernmentArea, readPageLimit } from '../policies.ts';
import type { WardPorts } from '../ports.ts';

/** The `C-009` query. */
export interface ListWardsInput {
  readonly localGovernmentArea?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** One page of the reference, or the refusal that stopped the read. */
export type ListWardsResult =
  | {
      readonly ok: true;
      readonly wards: readonly Ward[];
      readonly nextCursor: string | null;
    }
  | WardFailure;

/**
 * Reads one page of the ward reference.
 *
 * @param _caller - The caller; public, so it is not consulted.
 * @param deps - The ward reference port.
 * @param input - Local government area filter, cursor and page size.
 */
export async function listWards(
  _caller: WardCaller,
  deps: Pick<WardPorts, 'wards'>,
  input: ListWardsInput = {},
): Promise<ListWardsResult> {
  const area = readLocalGovernmentArea(input.localGovernmentArea);
  const limit = readPageLimit(input.limit);
  const fields: Record<string, WardFieldReason> = {
    ...(area.ok ? {} : area.fields),
    ...(limit.ok ? {} : limit.fields),
  };
  if (input.cursor !== undefined && input.cursor !== null && typeof input.cursor !== 'string') {
    fields['cursor'] = 'PATTERN_MISMATCH';
  }
  if (Object.keys(fields).length > 0) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_LIST_QUERY_INVALID',
      'The ward list query carries an unusable filter or page size.',
      fields,
    );
  }
  if (!area.ok || !limit.ok) {
    // Unreachable: the map above already returned. Kept so the narrowing is explicit to TypeScript.
    return wardFailure('VALIDATION_FAILED', 'WARD_LIST_QUERY_INVALID', 'The ward list query is invalid.');
  }

  try {
    const page = await deps.wards.list({
      ...(area.value === '' ? {} : { localGovernmentArea: area.value }),
      ...(typeof input.cursor === 'string' && input.cursor !== '' ? { cursor: input.cursor } : {}),
      limit: limit.value,
    });
    return { ok: true, wards: page.wards, nextCursor: page.nextCursor };
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'WARD_REFERENCE_UNAVAILABLE',
      'The ward list could not be read; the free-text field alone remains enough to continue.',
    );
  }
}
