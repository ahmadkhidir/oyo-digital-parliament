/**
 * Reading the ward review queue (`C-055`, `FEAT-001`, `FEAT-002`, screen 19).
 *
 * The route carries two work types. `descriptions` returns the descriptions residents wrote,
 * oldest first, each with the area they selected and the state of their account. `residences`
 * returns the members whose ward is resolved and whose residence is not yet accepted, oldest
 * registration first, with the display name, the confirmed ward and the registration date.
 *
 * Neither read resolves anything, assigns a ward or changes an identity state: the queue is the
 * reviewer's evidence, and the writes are separate, audited actions (`C-056`, `C-057`).
 */
import {
  wardFailure,
  type PendingWardResidence,
  type QueuedWardDescriptionReview,
  type WardCaller,
  type WardDescriptionReviewStatus,
  type WardFailure,
  type WardFieldReason,
  type WardOption,
  type WardReviewWork,
} from '../entities.ts';
import {
  isWardDescriptionReviewStatus,
  isWardReviewWork,
  readLocalGovernmentArea,
  readPageLimit,
} from '../policies.ts';
import type { WardPorts } from '../ports.ts';

/** The `C-055` query. `work` and `status` default to the queue the screen opens on. */
export interface ReadWardReviewQueueInput {
  readonly work?: WardReviewWork;
  readonly status?: WardDescriptionReviewStatus;
  readonly localGovernmentArea?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

/** One page of the queue, or the refusal that stopped the read. */
export type ReadWardReviewQueueResult =
  | {
      readonly ok: true;
      readonly work: 'descriptions';
      readonly reviews: readonly QueuedWardDescriptionReview[];
      readonly queuedCount: number;
      /** Wards the reviewer may resolve to: those of the areas represented on this page. */
      readonly candidateWards: readonly WardOption[];
      readonly nextCursor: string | null;
    }
  | {
      readonly ok: true;
      readonly work: 'residences';
      readonly residences: readonly PendingWardResidence[];
      readonly residenceCount: number;
      readonly nextCursor: string | null;
    }
  | WardFailure;

/**
 * Reads one page of the selected work type.
 *
 * @param caller - The caller; `C-055` admits the response-staff role only.
 * @param deps - The description queue, the residence queue and the ward reference ports.
 * @param input - Work type, status filter, area filter, cursor and page size.
 */
export async function readWardReviewQueue(
  caller: WardCaller,
  deps: Pick<WardPorts, 'wards' | 'wardDescriptionReviews' | 'residenceReviews'>,
  input: ReadWardReviewQueueInput = {},
): Promise<ReadWardReviewQueueResult> {
  if (caller.kind !== 'staff' || caller.role !== 'response_staff') {
    return wardFailure(
      'FORBIDDEN_ROLE',
      'WARD_REVIEWER_REQUIRED',
      'The ward review queue is read by response staff.',
    );
  }

  const work: WardReviewWork = input.work ?? 'descriptions';
  const status: WardDescriptionReviewStatus = input.status ?? 'queued';
  const fields: Record<string, WardFieldReason> = {};
  if (!isWardReviewWork(work)) fields['work'] = 'ENUM_MISMATCH';
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
      'The queue query carries an unusable work type, filter or page size.',
      fields,
    );
  }
  if (!isWardReviewWork(work) || !area.ok || !limit.ok) {
    return wardFailure(
      'VALIDATION_FAILED',
      'WARD_REVIEW_QUERY_INVALID',
      'The queue query is invalid.',
    );
  }

  if (work === 'residences') {
    let page;
    try {
      page = await deps.residenceReviews.listPending({
        ...(typeof input.cursor === 'string' && input.cursor !== '' ? { cursor: input.cursor } : {}),
        limit: limit.value,
      });
    } catch {
      return wardFailure(
        'SERVICE_DEGRADED',
        'WARD_REVIEW_QUEUE_UNAVAILABLE',
        'The residence list could not be read; the last successful queue stands.',
      );
    }

    let residenceCount: number;
    try {
      residenceCount = await deps.residenceReviews.countPending();
    } catch {
      return wardFailure(
        'SERVICE_DEGRADED',
        'WARD_REVIEW_QUEUE_UNAVAILABLE',
        'The residence list could not be counted; the last successful queue stands.',
      );
    }

    return {
      ok: true,
      work: 'residences',
      residences: page.residences,
      residenceCount,
      nextCursor: page.nextCursor,
    };
  }

  let page;
  try {
    page = await deps.wardDescriptionReviews.listQueue({
      status,
      ...(area.value === '' ? {} : { localGovernmentArea: area.value }),
      ...(typeof input.cursor === 'string' && input.cursor !== '' ? { cursor: input.cursor } : {}),
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
    work: 'descriptions',
    reviews: page.reviews,
    queuedCount,
    candidateWards,
    nextCursor: page.nextCursor,
  };
}
