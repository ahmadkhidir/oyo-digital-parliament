/**
 * The ward list route's transport half (`C-009`, `FEAT-002`, `NFR-002`).
 *
 * A query string is untyped text; the domain's `listWards` owns the rule and the paging. This module
 * converts the URL parameters into the contract's request shape, so a malformed `limit` is refused
 * with the field reason `C-001` names instead of reaching the use case as `NaN`.
 */
import type { Ward, WardFailure } from '@odp/domain';

/** What the handler reads before the domain answers. */
export type WardListQueryReading =
  | {
      readonly ok: true;
      readonly input: { localGovernmentArea?: string; cursor?: string; limit?: number };
    }
  | { readonly ok: false; readonly failure: WardFailure };

/** The `C-009` error body for a query the URL parser or the boundary refused. */
function queryFailure(): WardFailure {
  return {
    ok: false,
    code: 'VALIDATION_FAILED',
    cause: 'WARD_LIST_QUERY_INVALID',
    message: 'The ward list query carries an unusable filter or page size.',
    fields: { limit: 'PATTERN_MISMATCH' },
  };
}

/**
 * Reads the `C-009` query parameters.
 *
 * `limit` is absent or a whole number; a value that is not one is refused before the use case runs.
 * The use case still applies the contract's own upper bound, so the boundary and the domain cannot
 * disagree about the maximum.
 *
 * @param params - The request's decoded query string.
 */
export function parseWardListQuery(params: URLSearchParams): WardListQueryReading {
  const area = params.get('localGovernmentArea');
  const cursor = params.get('cursor');
  const rawLimit = params.get('limit');
  const limit = rawLimit === null || rawLimit === '' ? undefined : Number(rawLimit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    return { ok: false, failure: queryFailure() };
  }

  return {
    ok: true,
    input: {
      ...(area === null || area === '' ? {} : { localGovernmentArea: area }),
      ...(cursor === null || cursor === '' ? {} : { cursor }),
      ...(limit === undefined ? {} : { limit }),
    },
  };
}

/** One ward as `C-009` prints it: the stored fields, no member and no count. */
export interface WardListEntry {
  readonly id: string;
  readonly name: string;
  readonly localGovernmentArea: string;
  readonly aliases: readonly string[];
  readonly source: Ward['source'];
  readonly createdAt: string;
}

/** Projects one page of the reference into the `C-009` `data` array. */
export function wardListData(wards: readonly Ward[]): readonly WardListEntry[] {
  return wards.map((ward) => ({
    id: ward.id,
    name: ward.name,
    localGovernmentArea: ward.localGovernmentArea,
    aliases: ward.aliases,
    source: ward.source,
    createdAt: ward.createdAt,
  }));
}
