/**
 * The identity domain types (`schema.md` PendingRegistration, Member, Consent, DataRequest and
 * StaffUser, plus the staff credential projection the sign-in flow needs).
 *
 * Field names and enum spellings mirror `schema.md` verbatim, so the projection to `packages/db`
 * and to the wire stays a rename-free mapping (`packages/domain/AGENTS.md` Structure). This is the
 * one module allowed to hold a member's real name, telephone number and declared age; nothing in a
 * returned projection puts them on a public surface (`FEAT-001`, `FEAT-012`, `C-032`).
 *
 * Exported constant names are prefixed where the analytics module already publishes the same
 * schema enum under its own name, because `src/index.ts` exports one flat package surface.
 */
import type { RateLimitHeaders } from '../ports/session.ts';

/** `Member.locale` and `PendingRegistration.locale` - the two launch locales (`NFR-045`). */
export const MEMBER_LOCALES = ['en-NG', 'yo-NG'] as const;
export type Locale = (typeof MEMBER_LOCALES)[number];

/** `Member.identityState` - exactly two states, and the only two (`FEAT-001`). */
export const MEMBER_IDENTITY_STATES = ['registered', 'checked'] as const;
export type MemberIdentityState = (typeof MEMBER_IDENTITY_STATES)[number];

/** `Member.wardStatus`. */
export const MEMBER_WARD_STATUSES = ['resolved', 'unresolved'] as const;
export type MemberWardStatus = (typeof MEMBER_WARD_STATUSES)[number];

/** `Member.verificationMethod`. */
export const MEMBER_VERIFICATION_METHODS = ['self_code', 'organiser_attestation'] as const;
export type VerificationMethod = (typeof MEMBER_VERIFICATION_METHODS)[number];

/** `Consent.purpose`. One optional purpose per record, never bundled (`FEAT-012`). */
export const CONSENT_PURPOSE_VALUES = [
  'decision_notices',
  'record_transfer',
  'assisted_recording',
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSE_VALUES)[number];

/** `DataRequest.type`. */
export const DATA_REQUEST_TYPE_VALUES = ['access', 'correction', 'export', 'deletion'] as const;
export type DataRequestType = (typeof DATA_REQUEST_TYPE_VALUES)[number];

/** `DataRequest.status`. */
export const DATA_REQUEST_STATUS_VALUES = [
  'received',
  'in_progress',
  'completed',
  'deferred_for_legal_hold',
  'refused',
] as const;
export type DataRequestStatus = (typeof DATA_REQUEST_STATUS_VALUES)[number];

/** `StaffUser.role`. A staff user holds exactly one. */
export const STAFF_ROLES = [
  'ward_organiser',
  'response_staff',
  'moderator',
  'external_reviewer',
  'legal_reviewer',
  'operator',
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** A member account (`schema.md` Member).
 *
 * `telephoneNumber`, `fullName` and `declaredAge` are personal data and never leave the identity
 * module's own projections. `deletedAt` marks an anonymised row: the row remains so the public record
 * keeps a non-identifying author reference (`FEAT-012`).
 */
export interface MemberRecord {
  readonly id: string;
  readonly telephoneNumber: string;
  readonly fullName: string;
  readonly displayName: string;
  readonly declaredAge: number;
  readonly wardId?: string;
  readonly wardStatus: MemberWardStatus;
  readonly identityState: MemberIdentityState;
  readonly verificationMethod: VerificationMethod;
  readonly attestedById?: string;
  readonly attestedAt?: string;
  readonly locale: Locale;
  readonly createdAt: string;
  readonly deletedAt?: string;
}

/**
 * The form a self-registering resident submits before the code is accepted (`schema.md`
 * PendingRegistration, `C-002`). No Member exists while one of these is the only record.
 */
export interface PendingRegistration {
  readonly id: string;
  readonly telephoneNumber: string;
  readonly fullName: string;
  readonly displayName: string;
  readonly declaredAge: number;
  readonly locale: Locale;
  readonly codeSentAt?: string;
  /** 24 hours from `createdAt`, never extended by a resend (`C-004`). */
  readonly expiresAt: string;
  readonly verifiedAt?: string;
  readonly createdAt: string;
}

/**
 * One sign-in challenge (`C-005`, `C-006`).
 *
 * The challenge is ephemeral: it lives in the session store with the one account the number
 * resolves to, never as a record on the member. It exists only long enough to prove the number.
 */
export interface SignInChallenge {
  readonly id: string;
  readonly telephoneNumber: string;
  /**
   * The account that holds the number, as the challenge's own record carries it. A number belongs to
   * at most one live account (`FEAT-001`), so this list holds one entry; it stays an array because
   * the store's record is keyed that way.
   */
  readonly memberIds: readonly string[];
  readonly codeSentAt: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
}

/** `schema.md` Consent: one optional purpose, recorded separately from registration. */
export interface Consent {
  readonly id: string;
  readonly memberId: string;
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  readonly recordedAt: string;
  readonly withdrawnAt?: string;
}

/** `schema.md` DataRequest: a member's request to see, correct, export or delete their data. */
export interface DataRequest {
  readonly id: string;
  readonly memberId: string;
  readonly type: DataRequestType;
  readonly status: DataRequestStatus;
  readonly legalHoldNote?: string;
  /** Present only while the request is deferred for a legal hold (`C-032`, `C-036`, `C-067`). */
  readonly legalHoldReviewAt?: string;
  readonly outcomeReason?: string;
  readonly fileReference?: string;
  readonly completedById?: string;
  readonly requestedAt: string;
  readonly completedAt?: string;
}

/** `schema.md` StaffUser. Holds no member personal data. */
export interface StaffUser {
  readonly id: string;
  readonly fullName: string;
  readonly role: StaffRole;
  readonly external: boolean;
  readonly authorisedWardIds: readonly string[];
  readonly secondFactorEnrolled: boolean;
  readonly active: boolean;
  readonly createdAt: string;
}

/**
 * The projection of `schema.md` StaffCredential the sign-in rules need.
 *
 * The hashes and the encrypted TOTP secret are deliberately absent: the domain compares them through
 * the credential port, so a secret is never held in a rule, a result, a log line or an audit reason
 * (`C-092`).
 */
export interface StaffCredentialState {
  readonly id: string;
  readonly staffUserId: string;
  readonly username: string;
  readonly passwordChangedAt: string;
  /** Absent until enrolment is confirmed; a credential without it reaches enrolment and nothing else. */
  readonly secondFactorEnrolledAt?: string;
  /** One entry per issued recovery code, carrying only whether it was spent. */
  readonly recoveryCodes: readonly { readonly usedAt?: string }[];
  readonly failedAttemptCount: number;
  readonly lockedUntil?: string;
  readonly lastSignInAt?: string;
}

/** Who is asking. A public call is an unauthenticated visitor on a registration or sign-in screen. */
export type IdentityCaller =
  | {
      readonly kind: 'public';
      /** Held in the visitor's session before an account exists (`C-001` Locale). */
      readonly locale?: Locale;
      readonly correlationId?: string;
    }
  | {
      readonly kind: 'member';
      readonly memberId: string;
      /** The session being ended by `signOut` (`C-008`). */
      readonly sessionId: string;
      readonly correlationId?: string;
    }
  | {
      readonly kind: 'staff';
      readonly staffId: string;
      readonly role: StaffRole;
      readonly external: boolean;
      readonly authorisedWardIds: readonly string[];
      /** `false` between the password step and a satisfied second factor (`C-092`). */
      readonly secondFactorSatisfied: boolean;
      readonly secondFactorEnrolled: boolean;
      readonly sessionId: string;
      /** The password step's instant; the eight-hour absolute timeout runs from it. */
      readonly sessionStartedAt: string;
      /** The challenge's own end while the second factor is unsatisfied. */
      readonly sessionExpiresAt: string;
      readonly locale: Locale;
      readonly correlationId?: string;
    };

/** The `C-001` failure codes these use cases can return. */
export type IdentityFailureCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN_ROLE'
  | 'NOT_FOUND'
  | 'CONFLICT_ALREADY_DECIDED'
  | 'POLICY_VIOLATION'
  | 'LEGAL_HOLD'
  | 'RATE_LIMITED'
  | 'WRITE_QUEUED'
  | 'SERVICE_DEGRADED';

/** A field-level reason token from the frozen `C-001` set. */
export type IdentityFieldReason =
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

/** The recovery metadata `C-001` allows beside an error, as these entries define it. */
export interface IdentityFailureMeta {
  /** Where the caller should go next when the refusal has an obvious alternative. */
  readonly recoveryPath?: string;
  /** `C-035`: the export request already open for this member. */
  readonly existingDataRequestId?: string;
  /** `C-036`: the hold that deferred the request, and the date it is next reviewed. */
  readonly legalHoldNote?: string;
  /** `C-036`: the review date printed on a deferred export, as `DataRequest.legalHoldReviewAt`. */
  readonly legalHoldReviewAt?: string;
  /** `C-058`, `C-070`: the date an open legal review is reported against. */
  readonly reviewDate?: string;
  /** `C-004`: the pending registration survived a failed dispatch. */
  readonly pendingRegistrationPreserved?: boolean;
}

/**
 * A refused identity operation, in the shape the web layer wraps into the `C-001` error envelope.
 *
 * `retryAfterSeconds` is always present on `RATE_LIMITED` (`C-001`), `attemptsRemaining` carries the
 * remainder `C-003` says the answer states, and `meta` holds the recovery metadata each entry names.
 */
export interface IdentityFailure {
  readonly ok: false;
  readonly code: IdentityFailureCode;
  /** Stable upper-snake token naming the specific reason. */
  readonly cause: string;
  /** One sentence for the operator; never echoes a refused secret back. */
  readonly message: string;
  readonly fields: Readonly<Record<string, IdentityFieldReason>>;
  readonly retryAfterSeconds?: number;
  readonly attemptsRemaining?: number;
  readonly meta?: IdentityFailureMeta;
  /**
   * The `C-001` rate-limit signals the refusal's own limiter answer produced.
   *
   * A refusal the limiter handed down carries the cap, what is left of the window and when it resets,
   * so the transport prints `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and
   * `Retry-After` from this refusal rather than from a second consult. A refusal raised by a rule of
   * its own — a resend cooldown, a used code — has no limiter answer behind it and leaves this absent.
   */
  readonly rateLimit?: RateLimitHeaders;
}

/** Builds a refusal. Kept next to the shapes so every use case reports the same parts. */
export function identityFailure(
  code: IdentityFailureCode,
  cause: string,
  message: string,
  fields: Readonly<Record<string, IdentityFieldReason>> = {},
  extra: {
    readonly retryAfterSeconds?: number;
    readonly attemptsRemaining?: number;
    readonly meta?: IdentityFailureMeta;
    readonly rateLimit?: RateLimitHeaders;
  } = {},
): IdentityFailure {
  return {
    ok: false,
    code,
    cause,
    message,
    fields,
    ...(extra.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: extra.retryAfterSeconds }),
    ...(extra.attemptsRemaining === undefined
      ? {}
      : { attemptsRemaining: extra.attemptsRemaining }),
    ...(extra.meta === undefined ? {} : { meta: extra.meta }),
    ...(extra.rateLimit === undefined ? {} : { rateLimit: extra.rateLimit }),
  };
}
