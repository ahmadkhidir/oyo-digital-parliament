/**
 * The ward-reference domain types (`schema.md` Ward, WardDescriptionReview, ResidenceReview).
 *
 * Field names and enum spellings mirror `schema.md` verbatim, so the projection to `packages/db`
 * and to the wire stays a rename-free mapping (`packages/domain/AGENTS.md` Structure). Nothing here
 * carries a member's real name, telephone number or declared age: the ward reference is about
 * places, and the review records refer to a member only by the pseudonymous identifier.
 */

/** `Ward.source` - how the ward record came to exist. */
export const WARD_SOURCES = ['seeded', 'confirmed', 'reviewed'] as const;
export type WardSource = (typeof WARD_SOURCES)[number];

/** `Member.wardStatus` and `Submission.wardStatus`. */
export const WARD_STATUSES = ['resolved', 'unresolved'] as const;
export type WardStatus = (typeof WARD_STATUSES)[number];

/** `Member.identityState` - the two states, and the only two (`FEAT-001`). */
export const IDENTITY_STATES = ['registered', 'checked'] as const;
export type IdentityState = (typeof IDENTITY_STATES)[number];

/** `WardDescriptionReview.status`. */
export const WARD_DESCRIPTION_REVIEW_STATUSES = ['queued', 'resolved', 'rejected'] as const;
export type WardDescriptionReviewStatus = (typeof WARD_DESCRIPTION_REVIEW_STATUSES)[number];

/** The queue's two work types on one route (`C-055`, screen 19). */
export const WARD_REVIEW_WORKS = ['descriptions', 'residences'] as const;
export type WardReviewWork = (typeof WARD_REVIEW_WORKS)[number];

/** `ResidenceReview.method`. */
export const RESIDENCE_REVIEW_METHODS = [
  'ward_confirmation',
  'organiser_attestation',
  'document',
] as const;
export type ResidenceReviewMethod = (typeof RESIDENCE_REVIEW_METHODS)[number];

/** `ResidenceReview.decision`. */
export const RESIDENCE_REVIEW_DECISIONS = ['checked', 'rejected'] as const;
export type ResidenceReviewDecision = (typeof RESIDENCE_REVIEW_DECISIONS)[number];

/** `Submission.locationScope` - whether the location resolves inside Oyo State. */
export const LOCATION_SCOPES = ['in_state', 'out_of_state'] as const;
export type LocationScope = (typeof LOCATION_SCOPES)[number];

/** `Submission.status`, as far as ward resolution needs to see it. */
export type SubmissionStatus =
  'awaiting_decision' | 'decided' | 'withdrawn' | 'withheld' | 'out_of_area';

/** A ward of Oyo State as the platform records it (`schema.md` Ward, `FEAT-002`). */
export interface Ward {
  readonly id: string;
  readonly name: string;
  readonly localGovernmentArea: string;
  /** Other names residents have used, accumulated from confirmed and reviewed descriptions. */
  readonly aliases: readonly string[];
  readonly source: WardSource;
  /** Creation time in `C-001` form. */
  readonly createdAt: string;
}

/**
 * Where a candidate came from (`C-010` candidate `source`, `C-071` `matchType`).
 *
 * `exact` means the ward's own name matched; `alias` means one of the accumulated aliases did;
 * `model` is reserved for the `ward_candidate` capability (`C-080`), which this task does not
 * wire. The deterministic fallback therefore only ever returns `exact` and `alias`.
 */
export type WardCandidateSource = 'model' | 'exact' | 'alias';

/** One candidate offered to a resident for confirmation. Never an assignment (`C-010`). */
export interface WardCandidate {
  readonly wardId: string;
  readonly name: string;
  readonly localGovernmentArea: string;
  /** 1-based confidence ordering. Equal matches still need an explicit choice (`FEAT-002`). */
  readonly rank: number;
  readonly source: WardCandidateSource;
}

/** A resident's own description of their area, held for review (`schema.md` WardDescriptionReview). */
export interface WardDescriptionReview {
  readonly id: string;
  readonly memberId: string;
  readonly submissionId?: string;
  /** Personal free text: the resident's own words. Never logged, cached or emitted. */
  readonly description: string;
  readonly localGovernmentArea?: string;
  readonly status: WardDescriptionReviewStatus;
  readonly resolvedWardId?: string;
  readonly rejectionReason?: string;
  readonly reviewerId?: string;
  readonly createdAt: string;
  readonly resolvedAt?: string;
}

/** The review that moves a member from registered to checked (`schema.md` ResidenceReview). */
export interface ResidenceReview {
  readonly id: string;
  readonly memberId: string;
  readonly reviewerId: string;
  readonly method: ResidenceReviewMethod;
  /** Personal free text: the reviewer's private note. Never published or emitted. */
  readonly notes?: string;
  readonly decision: ResidenceReviewDecision;
  readonly reviewedAt: string;
}

/**
 * The roles a caller may hold. Members and the six staff roles, as `StaffUser.role` spells them.
 * `system` is deliberately absent: nothing in the ward reference acts on its own.
 */
export const WARD_CALLER_ROLES = [
  'member',
  'ward_organiser',
  'response_staff',
  'moderator',
  'external_reviewer',
  'legal_reviewer',
  'operator',
] as const;
export type WardCallerRole = (typeof WARD_CALLER_ROLES)[number];

/**
 * Who is asking.
 *
 * A member call names the session's member; a staff call names the staff user and the role the
 * session holds. `public` is the unauthenticated read (`C-009`). The form is a discriminated union
 * so a use case cannot read `memberId` off a staff caller by accident.
 */
export type WardCaller =
  | { readonly kind: 'public'; readonly correlationId?: string }
  | { readonly kind: 'member'; readonly memberId: string; readonly correlationId?: string }
  | {
      readonly kind: 'staff';
      readonly staffId: string;
      readonly role: Exclude<WardCallerRole, 'member'>;
      readonly correlationId?: string;
    };

/** The `C-001` failure codes these use cases can return. */
export type WardFailureCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'NOT_FOUND'
  | 'CONFLICT_ALREADY_DECIDED'
  | 'POLICY_VIOLATION'
  | 'SERVICE_DEGRADED';

/** A field-level reason token from the frozen `C-001` set. */
export type WardFieldReason =
  | 'REQUIRED'
  | 'PATTERN_MISMATCH'
  | 'OUT_OF_BAND'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'ENUM_MISMATCH'
  | 'IMMUTABLE'
  | 'ALREADY_SET'
  | 'UNKNOWN_FIELD'
  | 'NOT_FOUND';

/** A refused ward operation, in the `C-001` shape the web layer wraps into an error envelope. */
export interface WardFailure {
  readonly ok: false;
  readonly code: WardFailureCode;
  /** Stable upper-snake token naming the specific reason. */
  readonly cause: string;
  /** One sentence for the operator; never echoes the refused value back. */
  readonly message: string;
  readonly fields: Readonly<Record<string, WardFieldReason>>;
}

/** Builds a refusal. Kept next to the shapes so every use case reports the same three parts. */
export function wardFailure(
  code: WardFailureCode,
  cause: string,
  message: string,
  fields: Readonly<Record<string, WardFieldReason>> = {},
): WardFailure {
  return { ok: false, code, cause, message, fields };
}

/** One queued description as the review queue returns it (`C-055`). */
export interface QueuedWardDescriptionReview {
  readonly review: WardDescriptionReview;
  /** The member's current identity and ward state, or `null` when the row no longer exists. */
  readonly member: {
    readonly id: string;
    readonly identityState: IdentityState;
    readonly wardStatus: WardStatus;
    /** True when the account was anonymised after deletion (`Member.deletedAt` is set). */
    readonly deleted: boolean;
  } | null;
  /** References of the member's submissions that still carry no ward. */
  readonly submissionReferences: readonly string[];
}

/**
 * One member awaiting a residence review (`C-055` residences answer, `FEAT-001`).
 *
 * The projection is deliberately narrow: the display name the platform publishes, the confirmed
 * ward and the date registration was accepted. It never carries a real name, a telephone number, a
 * declared age or the resident's description (`packages/domain/AGENTS.md` Discipline).
 */
export interface PendingWardResidence {
  readonly memberId: string;
  readonly displayName: string;
  readonly wardId: string;
  readonly wardName: string;
  /** `Member.createdAt`; the list's working order (`C-055`). */
  readonly registeredAt: string;
}

/** A ward as the reviewer's picker shows it: the fields resolution needs and no others. */
export interface WardOption {
  readonly id: string;
  readonly name: string;
  readonly localGovernmentArea: string;
}
