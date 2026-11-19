/**
 * The effects the ward-reference use cases cannot perform themselves.
 *
 * One interface per aggregate the use cases read or write: the ward reference, the description queue,
 * the member's ward and identity state, the author's submissions, their backings, and the residence
 * review. The audit append, the analytics emitter, the clock and the identifier generator arrive in
 * the same bundle so a use case never reaches for an ambient dependency (`FEAT-002`, `C-009` to
 * `C-011`, `C-055` to `C-057`, `packages/domain/AGENTS.md` Discipline).
 *
 * These are declared beside the rules for the same reason the audit module declares its own: the
 * module must compile on its own, and an adapter satisfies them structurally without importing this
 * file.
 */
import type { AuditAppendPort } from '../audit/index.ts';
import type { ClockPort } from '../ports/clock.ts';
import type { IdentifierPort } from '../ports/identifiers.ts';
import type {
  IdentityState,
  LocationScope,
  QueuedWardDescriptionReview,
  ResidenceReview,
  ResidenceReviewDecision,
  ResidenceReviewMethod,
  SubmissionStatus,
  Ward,
  WardDescriptionReview,
  WardDescriptionReviewStatus,
  WardStatus,
} from './entities.ts';

/** One page of the ward reference (`C-009`). */
export interface WardListQuery {
  readonly localGovernmentArea?: string;
  /** Opaque cursor from the previous page, or absent for the first. */
  readonly cursor?: string;
  readonly limit: number;
}

/** The ward reference: what the platform records, not an external authoritative list. */
export interface WardReferencePort {
  /** Reads one page in `(localGovernmentArea, name, id)` order (`C-009`). */
  list(query: WardListQuery): Promise<{
    readonly wards: readonly Ward[];
    readonly nextCursor: string | null;
  }>;

  /** Reads one ward, or `null` when the identifier is unknown. */
  getById(wardId: string): Promise<Ward | null>;

  /**
   * Reads the whole reference for matching.
   *
   * The corpus is the state's ward list - hundreds of rows, not millions - so the deterministic
   * matcher loads it and ranks in memory rather than pushing a fuzzy rule into SQL. This also makes
   * the duplicate-name check possible across the whole list, not only across one page.
   */
  listForMatching(): Promise<readonly Ward[]>;

  /** Reads the wards of the given local government areas, for the reviewer's picker (`C-055`). */
  listByLocalGovernmentAreas(localGovernmentAreas: readonly string[]): Promise<readonly Ward[]>;

  /**
   * Accumulates the resident's wording as an alias of the ward.
   *
   * Called only from a confirmed or reviewed resolution, which is what `C-071` permits for a seeded
   * ward. The adapter must not create a duplicate alias that differs only in case.
   */
  appendAlias(input: { readonly wardId: string; readonly alias: string }): Promise<void>;
}

/** A page of the description queue (`C-055`). */
export interface WardDescriptionReviewQuery {
  readonly status: WardDescriptionReviewStatus;
  readonly localGovernmentArea?: string;
  readonly cursor?: string;
  readonly limit: number;
}

/** The queued descriptions and their reviewer-facing context. */
export interface WardDescriptionReviewPort {
  /** Records a new review item. The `queued` status is the only one a caller may create. */
  create(review: WardDescriptionReview): Promise<void>;

  /** Reads one item, or `null`. */
  findById(reviewId: string): Promise<WardDescriptionReview | null>;

  /** Reads the queued items a member has open, so a confirmation can settle them. */
  listQueuedByMember(memberId: string): Promise<readonly WardDescriptionReview[]>;

  /** Reads one page oldest first (`C-055`). */
  listQueue(query: WardDescriptionReviewQuery): Promise<{
    readonly reviews: readonly QueuedWardDescriptionReview[];
    readonly nextCursor: string | null;
  }>;

  /** How many descriptions are waiting; the queue header's count (`C-055`). */
  countQueued(): Promise<number>;

  /**
   * Marks one queued item resolved.
   *
   * @returns `false` when the row was no longer queued, which is the lost race against another
   *   reviewer and must be reported as `CONFLICT_ALREADY_DECIDED` rather than overwritten.
   */
  markResolved(input: {
    readonly reviewId: string;
    readonly wardId: string;
    readonly reviewerId: string;
    readonly resolvedAt: string;
  }): Promise<boolean>;

  /** Marks one queued item rejected. Same conditional write and same `false` on a lost race. */
  markRejected(input: {
    readonly reviewId: string;
    readonly rejectionReason: string;
    readonly reviewerId: string;
    readonly resolvedAt: string;
  }): Promise<boolean>;
}

/** A member's ward and identity state, as the ward actions need to see them. */
export interface WardMemberState {
  readonly id: string;
  readonly wardId?: string;
  readonly wardStatus: WardStatus;
  readonly identityState: IdentityState;
  /** Set once direct identifiers were removed; the row itself remains. */
  readonly deletedAt?: string;
}

/** The member's ward and identity fields, written only by the resolution and review actions. */
export interface WardMemberPort {
  get(memberId: string): Promise<WardMemberState | null>;

  /** Records the ward and sets `wardStatus: resolved` in one write (`C-011`, `C-056`). */
  recordWard(memberId: string, wardId: string): Promise<void>;

  /** Moves the member between the two identity states (`C-057`). Never used to demote. */
  setIdentityState(memberId: string, state: IdentityState): Promise<void>;
}

/** A submission as ward resolution sees it. */
export interface WardSubmissionState {
  readonly id: string;
  readonly reference: string;
  readonly wardStatus: WardStatus;
  readonly locationScope: LocationScope;
  readonly status: SubmissionStatus;
}

/** The author's submissions, for the resolution move and its counts (`C-056`). */
export interface WardSubmissionPort {
  /** Submissions by the author that still carry no ward, oldest first. */
  listUnresolvedByAuthor(memberId: string): Promise<readonly WardSubmissionState[]>;

  /** How many of the author's submissions already carry a ward, which resolution must not move. */
  countWithWardByAuthor(memberId: string): Promise<number>;

  /**
   * Places the given submissions in the ward.
   *
   * Only rows that are still unresolved, in state and not out of area are touched; the adapter must
   * not rewrite `body` or `location_text`.
   *
   * @returns The public references actually moved.
   */
  assignWard(submissionIds: readonly string[], wardId: string): Promise<readonly string[]>;
}

/** The member's backings, counted for the residence review result (`C-057`). */
export interface WardBackingPort {
  /** Active backings held by the member. */
  countByMember(memberId: string): Promise<number>;
}

/** The residence review record (`C-057`). */
export interface ResidenceReviewPort {
  record(review: ResidenceReview): Promise<void>;
}

/** One analytics event the ward actions emit, named and shaped as `analytics.md` declares. */
export type WardAnalyticsEvent =
  | {
      readonly name: 'ward_candidate_suggested';
      readonly properties: {
        readonly candidate_count: number;
        readonly source: 'fallback' | 'model';
      };
    }
  | {
      readonly name: 'ward_confirmed';
      readonly properties: {
        readonly ward_id: string;
        readonly candidate_rank: number;
        readonly source: string;
      };
    }
  | {
      readonly name: 'ward_sent_for_review';
      readonly properties: { readonly lga_matched: boolean };
    }
  | {
      readonly name: 'ward_review_resolved';
      readonly properties: { readonly resolution: 'resolved' | 'rejected' };
    }
  | {
      readonly name: 'residence_review_completed';
      readonly properties: {
        readonly decision: ResidenceReviewDecision;
        readonly method: ResidenceReviewMethod;
      };
    }
  | {
      readonly name: 'identity_state_changed';
      readonly properties: {
        readonly from_state: IdentityState;
        readonly to_state: IdentityState;
      };
    };

/**
 * Emits one product event (`C-089`).
 *
 * A rejection is the caller's problem to buffer and retry, never the originating write's, so the use
 * cases swallow it: `C-089` is explicit that analytics does not fail the change that produced the
 * event (`packages/domain/AGENTS.md` Discipline).
 */
export interface WardAnalyticsPort {
  /** @throws when the analytics store did not take the event. */
  emit(event: WardAnalyticsEvent): Promise<void>;
}

/** The port bundle every ward use case receives. */
export interface WardPorts {
  readonly wards: WardReferencePort;
  readonly wardDescriptionReviews: WardDescriptionReviewPort;
  readonly members: WardMemberPort;
  readonly submissions: WardSubmissionPort;
  readonly backings: WardBackingPort;
  readonly residenceReviews: ResidenceReviewPort;
  readonly audit: AuditAppendPort;
  readonly analytics: WardAnalyticsPort;
  readonly clock: ClockPort;
  readonly identifiers: IdentifierPort;
}
