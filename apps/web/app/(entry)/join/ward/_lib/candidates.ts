/**
 * The ward candidate suggestion handler's processing (`C-010`, `FEAT-002`, `NFR-014`).
 *
 * The route handler parses and authorises; this module carries the boundary's validation and the
 * call into the domain, so a test runs it without the HTTP layer. The answer never assigns a ward
 * and never blocks the resident: an empty candidate list is a normal answer, and the deterministic
 * fallback's `capabilityStatus:"fallback"` is printed unchanged — no notice is shown for it, which
 * the screen file states ("Suggestion unavailable … no notice to the resident").
 */
import {
  suggestWardCandidates,
  WARD_DESCRIPTION_MAX_LENGTH,
  WARD_LOCAL_GOVERNMENT_AREA_MAX_LENGTH,
  wardFailure,
  type SuggestWardCandidatesResult,
  type WardCaller,
  type WardCandidate,
  type WardCandidateCapabilityStatus,
  type WardFailure,
  type WardPorts,
} from '@odp/domain';

/** The parsed `C-010` request body. */
export interface ParsedCandidatesRequest {
  readonly description: string;
  readonly localGovernmentArea: string;
}

/** Either the parsed request, or the transport refusal the handler answers with. */
export type CandidatesParseResult =
  | { readonly ok: true; readonly request: ParsedCandidatesRequest }
  | { readonly ok: false; readonly failure: WardFailure };

/** A boundary refusal in the shape the handler's error envelope takes. */
function parseFailure(
  cause: string,
  message: string,
  fields: Readonly<Record<string, 'REQUIRED' | 'TOO_LONG' | 'PATTERN_MISMATCH'>>,
): CandidatesParseResult {
  return {
    ok: false,
    failure: { ok: false, code: 'VALIDATION_FAILED', cause, message, fields },
  };
}

/**
 * Parses the `C-010` request body.
 *
 * The body is a JSON object with two string fields; anything else is refused at the boundary with
 * `C-001`'s field reasons. The domain re-checks the values themselves.
 *
 * @param raw - The decoded JSON body.
 */
export function parseCandidatesRequest(raw: unknown): CandidatesParseResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return parseFailure('REQUEST_BODY_INVALID', 'The request body must be a JSON object.', {
      body: 'PATTERN_MISMATCH',
    });
  }
  const body = raw as Record<string, unknown>;
  const description = body['description'];
  if (typeof description !== 'string' || description.trim() === '') {
    return parseFailure('WARD_DESCRIPTION_INVALID', 'The description is required.', {
      description: 'REQUIRED',
    });
  }
  if (description.length > WARD_DESCRIPTION_MAX_LENGTH) {
    return parseFailure(
      'WARD_DESCRIPTION_INVALID',
      'The description is longer than the field allows.',
      { description: 'TOO_LONG' },
    );
  }

  const area = body['localGovernmentArea'];
  if (area !== undefined && area !== null && typeof area !== 'string') {
    return parseFailure(
      'WARD_DESCRIPTION_INVALID',
      'The local government area must be a name from the reference.',
      { localGovernmentArea: 'PATTERN_MISMATCH' },
    );
  }
  if (typeof area === 'string' && area.length > WARD_LOCAL_GOVERNMENT_AREA_MAX_LENGTH) {
    return parseFailure('WARD_DESCRIPTION_INVALID', 'The local government area is too long.', {
      localGovernmentArea: 'TOO_LONG',
    });
  }

  return {
    ok: true,
    request: {
      description,
      localGovernmentArea: typeof area === 'string' ? area : '',
    },
  };
}

/** The runner the handler calls; a test injects the domain's own fakes. */
export interface CandidatesRunner {
  run(caller: WardCaller, request: ParsedCandidatesRequest): Promise<SuggestWardCandidatesResult>;
}

/** The production runner: the domain use case over the ward reference and the analytics bridge. */
export function createCandidatesRunner(
  ports: Pick<WardPorts, 'wards' | 'analytics'>,
): CandidatesRunner {
  return {
    run: (caller, request) =>
      suggestWardCandidates(
        caller,
        ports,
        request.localGovernmentArea === ''
          ? { description: request.description }
          : {
              description: request.description,
              localGovernmentArea: request.localGovernmentArea,
            },
      ),
  };
}

/** The `C-010` answer's data, in the contract's shape. */
export interface CandidatesAnswer {
  readonly candidates: readonly WardCandidate[];
  readonly capabilityStatus: WardCandidateCapabilityStatus;
  readonly confirmationRequired: true;
}

/**
 * Runs one suggestion and returns either the answer's data or the failure to answer with.
 *
 * @param runner - The domain runner.
 * @param caller - The session's member caller, or `null` when no session was resolved.
 * @param request - The parsed request.
 */
export async function processCandidates(
  runner: CandidatesRunner,
  caller: WardCaller | null,
  request: ParsedCandidatesRequest,
): Promise<
  | { readonly ok: true; readonly answer: CandidatesAnswer }
  | { readonly ok: false; readonly failure: WardFailure }
> {
  if (caller === null || caller.kind !== 'member') {
    return {
      ok: false,
      failure: wardFailure(
        'UNAUTHENTICATED',
        'MEMBER_SESSION_REQUIRED',
        'Ward candidates are offered inside a member session.',
      ),
    };
  }

  const result = await runner.run(caller, request);
  if (result.ok) {
    return {
      ok: true,
      answer: {
        candidates: result.candidates,
        capabilityStatus: result.capabilityStatus,
        confirmationRequired: true,
      },
    };
  }
  return { ok: false, failure: result };
}
