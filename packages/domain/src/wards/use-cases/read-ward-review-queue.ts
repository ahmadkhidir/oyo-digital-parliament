/**
 * Reading the description review queue (`C-055`, `FEAT-002`, screen 19).
 *
 * Response staff read the descriptions residents wrote, oldest first, each with the area they
 * selected and the state of their account. The read never resolves anything and never assigns a
 * ward: it is the reviewer's evidence, and the resolution is a separate, audited action (`C-056`).
 */
import {
  wardFailure,
  type QueuedWardDescriptionReview,
  type WardCaller,
  type WardDescriptionReviewStatus,
  type WardFailure,
  type WardFieldReason,
  type WardOption,
} from '../entities.ts';
import {
  isWardDescriptionReviewStatus,
  readLocalGovernmentArea,
  readPageLimit,
} from '../policies.ts';
import type { WardPorts } from '../ports.ts';

/** The `C-055` query. `status` defaults to the queue the screen opens on. */
export interface ReadWardReviewQueueInput {
  readonly status?: WardDescriptionReviewStatus;
  readonly localGovernmentArea?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** One page of the queue, or the refusal that stopped the read. */
export type ReadWardReviewQueueResult =
  | {
      readonly ok: true;
      readonly reviews: readonly QueuedWardDescriptionReview[];
      readonly queuedCount: number;
      /** Wards the reviewer may resolve to: those of the areas represented on this page. */
      readonly candidateWards: readonly WardOption[];
      readonly nextCursor: string | null;
    }
  | WardFailure;

/**
 * Reads one page of queued descriptions.
 *
 * @param caller - The caller; `C-055` admits the response-staff role only.
 * @param deps - The review queue and ward reference ports.
 * @param input - Status filter, area filter, cursor and page size.
 */
export async function readWardReviewQueue(
  caller: WardCaller,
  deps: Pick<WardPorts, 'wards' | 'wardDescriptionReviews'>,
  input: ReadWardReviewQueueInput = {},
): Promise<ReadWardReviewQueueResult> {
  if (caller.kind !== 'staff' || caller.role !== 'response_staff') {
    return wardFailure(
      'FORBIDDEN_ROLE',
      'WARD_REVIEWER_REQUIRED',
      'The ward review queue is read by response staff.',
    );
  }

  const status: WardDescriptionReviewStatus = input.status ?? 'queued';
  const fields: Record<string, WardFieldReason> = {};
  if (!isWardDescriptionReviewStatus(status)) fields['status'] = 'ENUM_MISMATCH';
  const area = readLocalGovernmentArea(input.localGovernmentArea);
  const limit = readPageLimit(input.limit);
  if (!area.ok) Object.assign(fields, area.fields);
  if (!limit.ok) Object.assign(fields, limit.fields);
  if (input.cursor !== undefined && input.cursor !== null && typeof input.cursor !== 'string') {
    fields['cursor'] = 'PATTERN_MISMATCH';
  }
  if (Object.keys(fields).length > 0) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_REVIEW_QUERY_INVALID',
      'The queue query carries an unusable filter or page size.',
      fields,
    );
  }
  if (!area.ok || !limit.ok) {
    return wardFailure('VALIDATION_FAILED', 'WARD_REVIEW_QUERY_INVALID', 'The queue query is invalid.');
  }

  let page;
  try {
    page = await deps.wardDescriptionReviews.listQueue({
      status,
      ...(area.value === '' ? {} : { localGovernmentArea: area.value }),
      ...(typeof input.cursor === 'string' && input.cursor !== ''
        ? { cursor: input.cursor }
        : {}),
      limit: limit.value,
    });
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'WARD_REVIEW_QUEUE_UNAVAILABLE',
      'The review queue could not be read; the last successful queue stands.',
    );
  }

  let queuedCount: number;
  try {
    queuedCount = await deps.wardDescriptionReviews.countQueued();
  } catch {
    return wardFailure(
      'SERVICE_DEGRADED',
      'WARD_REVIEW_QUEUE_UNAVAILABLE',
      'The review queue could not be counted; the last successful queue stands.',
    );
  }

  // The picker offers the wards of the areas on this page, plus the filter when one was supplied:
  // a reviewer resolving a case never needs the whole state's list, and two wards sharing a name
  // always appear with their area (`FEAT-002`, screen 19).
  const areas = new Set<string>();
  if (area.value !== '') areas.add(area.value);
  for (const entry of page.reviews) {
    if (entry.review.localGovernmentArea !== undefined) {
      areas.add(entry.review.localGovernmentArea);
    }
  }

  let candidateWards: readonly WardOption[] = [];
  if (areas.size > 0) {
    try {
      const wards = await deps.wards.listByLocalGovernmentAreas([...areas]);
      candidateWards = wards
        .map((ward) => ({
          id: ward.id,
          name: ward.name,
          localGovernmentArea: ward.localGovernmentArea,
        }))
        .sort((left, right) => {
          const byArea = left.localGovernmentArea.localeCompare(right.localGovernmentArea);
          return byArea !== 0 ? byArea : left.name.localeCompare(right.name);
        });
    } catch {
      return wardFailure(
        'SERVICE_DEGRADED',
        'WARD_REFERENCE_UNAVAILABLE',
        'The ward list could not be read, so the queue cannot be shown with a picker.',
      );
    }
  }

  return {
    ok: true,
    reviews: page.reviews,
    queuedCount,
    candidateWards,
    nextCursor: page.nextCursor,
  };
}
