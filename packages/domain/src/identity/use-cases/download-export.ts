/**
 * Serving a completed export (`C-036`, `FEAT-012`, `NFR-040`).
 *
 * Returns the machine-readable file produced for the caller's own export request and never generates a
 * second one: asking twice answers with the same object. The URL is short-lived and the read is logged.
 */
import {
  identityFailure,
  type DataRequest,
  type IdentityCaller,
  type IdentityFailure,
} from '../entities.ts';
import { EXPORT_URL_TTL_SECONDS, toIsoSeconds } from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import { appendIdentityAudit } from './support.ts';

/** The `C-036` request. */
export interface DownloadExportInput {
  readonly requestId: string;
}

/** The `C-036` answer, or the refusal that stopped it. */
export type DownloadExportResult =
  | {
      readonly ok: true;
      readonly url: string;
      readonly filename: string;
      readonly contentType: 'application/zip';
      readonly expiresInSeconds: number;
    }
  | IdentityFailure;

/**
 * Issues a short-lived URL for one of the caller's export files.
 *
 * @param caller - The member who owns the request.
 * @param deps - The data-request, legal-hold, object-store and audit ports.
 * @param input - The data request's identifier.
 */
export async function downloadExport(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: DownloadExportInput,
): Promise<DownloadExportResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Sign in to download your data.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'A staff session cannot download a member’s export.',
    );
  }
  if (typeof input.requestId !== 'string' || input.requestId === '') {
    return identityFailure(
      'VALIDATION_FAILED',
      'EXPORT_REQUEST_INVALID',
      'The export request is missing.',
      { requestId: 'REQUIRED' },
    );
  }

  let request: DataRequest | null;
  try {
    request = await deps.dataRequests.findById(input.requestId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your request could not be read. Try again in a moment.',
    );
  }
  // `C-036`: another member's request, an unknown one and a non-export answer the same way.
  if (request === null || request.memberId !== caller.memberId || request.type !== 'export') {
    return identityFailure('NOT_FOUND', 'EXPORT_NOT_FOUND', 'That export does not exist.');
  }
  if (request.status === 'deferred_for_legal_hold') {
    let reviewDate: string | undefined;
    try {
      const hold = await deps.legalHolds.findOpenForMember(request.memberId);
      reviewDate = hold?.reviewDate;
    } catch {
      reviewDate = undefined;
    }
    return identityFailure(
      'LEGAL_HOLD',
      'EXPORT_DEFERRED_FOR_LEGAL_HOLD',
      'This export is paused while a legal review finishes. We will write to you when it is reviewed.',
      {},
      {
        meta: {
          ...(request.legalHoldNote === undefined ? {} : { legalHoldNote: request.legalHoldNote }),
          ...(reviewDate === undefined ? {} : { reviewDate }),
        },
      },
    );
  }
  if (request.status !== 'completed' || request.fileReference === undefined) {
    return identityFailure(
      'NOT_FOUND',
      'EXPORT_NOT_READY',
      'That export is not ready yet. We will tell you when it is.',
    );
  }

  let url: string;
  try {
    url = await deps.objectStore.signedReadUrl(request.fileReference, EXPORT_URL_TTL_SECONDS);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'OBJECT_STORAGE_UNAVAILABLE',
      'The file could not be reached. Try again in a moment.',
    );
  }

  const refused = await appendIdentityAudit(deps, {
    actorId: caller.memberId,
    actorRole: 'member',
    action: 'member_data.export',
    entityType: 'DataRequest',
    entityId: request.id,
    reason: 'EXPORT_DOWNLOADED',
    occurredAt: toIsoSeconds(deps.clock.now()),
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  return {
    ok: true,
    url,
    filename: `odp-export-${caller.memberId}.zip`,
    contentType: 'application/zip',
    expiresInSeconds: EXPORT_URL_TTL_SECONDS,
  };
}
