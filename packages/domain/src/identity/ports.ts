/**
 * The effects the identity use cases cannot perform themselves.
 *
 * One interface per aggregate the rules read or write: the pending registrations, the one-time codes,
 * the sign-in challenges, the members, their consents, their data requests and their authored record,
 * the two session namespaces, the staff credential and its second factor, the queue that keeps a write
 * it could not take, and the limiter. The audit append, the analytics emitter, the clock and the
 * identifier generator arrive in the same bundle, so a use case never reaches for an ambient dependency
 * (`FEAT-001`, `FEAT-012`, `C-002` to `C-008`, `C-032` to `C-036`, `C-092`, `packages/domain/AGENTS.md`
 * Discipline).
 *
 * These interfaces are structural: `packages/db` and `packages/platform` satisfy them without
 * importing this file, and the in-memory fakes in `fakes.ts` prove the rules without a database.
 */
import type { AnalyticsPayloads } from '../analytics/index.ts';
import type { AuditAppendPort } from '../audit/index.ts';
import type { ClockPort } from '../ports/clock.ts';
import type { IdentifierPort } from '../ports/identifiers.ts';
import type { ObjectStoragePort } from '../ports/object-store.ts';
import type {
  Consent,
  ConsentPurpose,
  DataRequest,
  DataRequestType,
  Locale,
  MemberRecord,
  PendingRegistration,
  SignInChallenge,
  StaffCredentialState,
  StaffUser,
} from './entities.ts';

/** The delivery result one code dispatch reports (`C-002`, `C-004`, `C-005`). */
export interface CodeDelivery {
  readonly status: 'sent' | 'delayed';
  readonly channel: 'sms';
}

/**
 * The one-time code store, shared by registration and sign-in.
 *
 * The code value never leaves the adapter: the domain asks for an issue, a comparison and a
 * consumption, never for the digits. Attempt accounting lives beside the code because an attempt limit
 * without the code it counts is meaningless. `targetId` is the PendingRegistration or the
 * SignInChallenge identifier, never a telephone number, so a key cannot carry personal data.
 */
export interface VerificationCodePort {
  /**
   * Voids any outstanding code, issues a fresh six-digit one, stores it hashed and sends it.
   *
   * @throws when neither the store nor the SMS gateway took the dispatch. The caller answers
   *   `delayed` at registration and `SERVICE_DEGRADED` on a resend, as those entries state.
   */
  issue(input: {
    readonly targetId: string;
    readonly telephoneNumber: string;
    readonly locale: Locale;
    readonly at: string;
  }): Promise<CodeDelivery>;

  /**
   * Compares a supplied code in constant time.
   *
   * @throws when the store could not answer; the caller then refuses rather than accepting.
   */
  matches(targetId: string, code: string): Promise<boolean>;

  /** Void the stored code. Called on acceptance so a code can never create a second account. */
  consume(targetId: string): Promise<void>;

  /** The attempt accounting for one target. */
  readAttempts(targetId: string): Promise<CodeAttempts>;

  /** Records one wrong attempt, returning the count after it. */
  recordFailure(targetId: string, at: string): Promise<number>;

  /** Starts the short cooldown that follows the attempt limit. */
  startCooldown(targetId: string, until: string): Promise<void>;
}

/** Attempt accounting for one code target. */
export interface CodeAttempts {
  readonly attempts: number;
  readonly cooldownUntil?: string;
}

/** The pending registrations a code is proved against (`schema.md` PendingRegistration). */
export interface PendingRegistrationPort {
  create(pending: PendingRegistration): Promise<void>;
  findById(pendingId: string): Promise<PendingRegistration | null>;
  /** Records `verifiedAt`; the account is created in the same unit of work (`C-003`). */
  markVerified(pendingId: string, at: string): Promise<void>;
  /** Records `codeSentAt` after a resend. Never touches `expiresAt` (`C-004`). */
  recordCodeSent(pendingId: string, at: string): Promise<void>;
}

/**
 * The member accounts.
 *
 * There is no method that lists members by ward, by local government area or by any other grouping,
 * and there never may be: `FEAT-012` makes that operation absent rather than forbidden
 * (`packages/domain/AGENTS.md` Discipline). `findByTelephone` exists because a shared handset must list
 * its accounts after a code, and returns them without merging anything.
 */
export interface MemberPort {
  /** Every live account on one number, oldest first. An anonymised row is not a sign-in account. */
  findByTelephone(telephoneNumber: string): Promise<readonly MemberRecord[]>;

  get(memberId: string): Promise<MemberRecord | null>;

  create(member: MemberRecord): Promise<void>;

  /** Marks every live account on the number as sharing it, never merging two of them (`FEAT-001`). */
  markSharedNumber(telephoneNumber: string): Promise<void>;

  /** Rewrites the three fields `C-033` may change on the caller's own row. */
  updateProfile(
    memberId: string,
    input: { readonly displayName: string; readonly fullName: string; readonly locale: Locale },
  ): Promise<void>;

  /** Whether another live member already publishes this display name. */
  isDisplayNameTaken(displayName: string, exceptMemberId?: string): Promise<boolean>;

  /**
   * Removes the direct identifiers from one member and stamps `deletedAt` (`FEAT-012`).
   *
   * The adapter replaces `telephoneNumber`, `fullName` and `declaredAge` with non-identifying values
   * and keeps the row, because the public record keeps a non-identifying author reference. It never
   * deletes the row, and it must leave submissions, comments and backings in place.
   */
  anonymise(memberId: string, at: string): Promise<void>;

  /** How much public writing the member has attributed to the current display name (`C-033`). */
  countAuthoredContent(memberId: string): Promise<{
    readonly submissions: number;
    readonly comments: number;
  }>;
}

/** Sign-in challenges, keyed by the `sic_` identifier (`C-005`, `C-006`). */
export interface SignInChallengePort {
  /** Creates the challenge and reports its attempt number for `EVT-002`. */
  create(input: {
    readonly id: string;
    readonly telephoneNumber: string;
    readonly memberIds: readonly string[];
    readonly at: string;
    readonly expiresAt: string;
  }): Promise<{ readonly attempt: number }>;

  findById(challengeId: string): Promise<SignInChallenge | null>;

  /**
   * Marks the challenge used.
   *
   * @returns `false` when another request consumed it first, which must be reported as
   *   `CONFLICT_ALREADY_DECIDED` rather than opening a second session.
   */
  consume(challengeId: string, at: string): Promise<boolean>;
}

/** The member's own consents (`schema.md` Consent, `C-034`). */
export interface ConsentPort {
  listForMember(memberId: string): Promise<readonly Consent[]>;

  /** The most recent record for one purpose, or `null` when the purpose was never answered. */
  latestForPurpose(memberId: string, purpose: ConsentPurpose): Promise<Consent | null>;

  create(consent: Consent): Promise<void>;

  /** Withdraws the active record in place: the row keeps its history (`FEAT-012`). */
  withdraw(consentId: string, at: string): Promise<void>;
}

/** The member's own data requests (`schema.md` DataRequest, `C-035`, `C-036`). */
export interface DataRequestPort {
  listForMember(memberId: string): Promise<readonly DataRequest[]>;

  /** The open export request, if one exists; a second is refused rather than queued (`C-035`). */
  findOpenExport(memberId: string): Promise<DataRequest | null>;

  findById(requestId: string): Promise<DataRequest | null>;

  create(request: DataRequest): Promise<void>;
}

/** One submission row as the member's own record shows it (`C-032`). */
export interface MemberSubmissionRow {
  readonly reference: string;
  readonly status: string;
  readonly decision: {
    readonly type: 'commit' | 'decline' | 'refer';
    readonly authority: string | null;
  } | null;
}

/** One backing the member holds, as their own record shows it (`C-032`). */
export interface HeldBackingRow {
  readonly submissionReference: string;
  readonly submissionStatus: string;
  readonly backingState: 'active' | 'withdrawn' | 'voided';
}

/** One of the member's items currently withheld from publication (`C-032` `heldItems`). */
export interface HeldItemRow {
  readonly reference: string;
  readonly reason: string;
}

/** The member's authored and held record. Reads only the caller's own rows (`C-032`). */
export interface MemberContentPort {
  listSubmissions(
    memberId: string,
    query: { readonly cursor?: string; readonly limit: number },
  ): Promise<{
    readonly rows: readonly MemberSubmissionRow[];
    readonly nextCursor: string | null;
  }>;

  listHeldBackings(memberId: string): Promise<readonly HeldBackingRow[]>;

  listHeldItems(memberId: string): Promise<readonly HeldItemRow[]>;

  /**
   * Marks every submission by the member as withdrawn by its author (`FEAT-012`).
   *
   * The submission rows and their text remain: removal is a state change, never a delete. Comments and
   * backings follow the same rule.
   *
   * @returns How many submissions moved.
   */
  withdrawAuthoredSubmissions(memberId: string, at: string): Promise<number>;
}

/** An open legal review that blocks a change (`C-035`, `C-036`, `C-070`). */
export interface LegalHoldPort {
  /** The open hold on this member's record, with the date it is next reviewed. */
  findOpenForMember(memberId: string): Promise<{ readonly reviewDate: string } | null>;
}

/** A resolved member session, as the cookie reader reports it. */
export interface ResolvedMemberSession {
  readonly sessionId: string;
  readonly memberId: string;
  readonly expiresAt: string;
  readonly absoluteExpiresAt: string;
  readonly lastSeenAt: string;
}

/** A resolved staff session, as the staff cookie reader reports it. */
export interface ResolvedStaffSession {
  readonly sessionId: string;
  readonly staffId: string;
  readonly secondFactorSatisfied: boolean;
  readonly startedAt: string;
  readonly expiresAt: string;
  readonly absoluteExpiresAt: string;
  readonly lastSeenAt: string;
}

/** The member session namespace (`odp_session`, `C-003`, `C-006`, `C-008`). */
export interface MemberSessionPort {
  /** Writes the session and returns the instant it ends. The token stays with the adapter. */
  create(input: {
    readonly memberId: string;
    readonly at: string;
    readonly expiresAt: string;
    readonly absoluteExpiresAt: string;
  }): Promise<{ readonly sessionId: string }>;

  /** Resolves the opaque cookie value, or `null` when it names no live session. */
  read(token: string): Promise<ResolvedMemberSession | null>;

  end(sessionId: string): Promise<void>;
}

/** The staff session namespace (`odp_staff_session`, `C-092`). */
export interface StaffSessionPort {
  /** Opens the password-step session: unsatisfied, and only the factor screens are admitted. */
  create(input: {
    readonly staffId: string;
    readonly at: string;
    readonly expiresAt: string;
    readonly absoluteExpiresAt: string;
  }): Promise<{ readonly sessionId: string }>;

  read(token: string): Promise<ResolvedStaffSession | null>;

  /** Replaces the challenge window with the satisfied (or enrolled-but-unsatisfied) one. */
  upgrade(
    sessionId: string,
    input: {
      readonly secondFactorSatisfied: boolean;
      readonly at: string;
      readonly expiresAt: string;
      readonly absoluteExpiresAt: string;
    },
  ): Promise<void>;

  end(sessionId: string): Promise<void>;

  /** Ends every session for a staff user, used when the credential is reset or the role changes. */
  endAllForStaff(staffUserId: string): Promise<void>;
}

/** A TOTP enrolment as `C-092` prints it once. The secret is returned by this answer only. */
export interface TotpEnrolment {
  readonly otpauthUri: string;
  readonly secret: string;
  readonly algorithm: 'SHA1';
  readonly digits: number;
  readonly periodSeconds: number;
}

/**
 * The staff credential and its second factor.
 *
 * Password hashing and time-based code computation are the adapter's work, because the domain has no
 * hashing library and no clock-derived HMAC (`NFR-021`). The domain still owns the policy: it supplies
 * the digit count, the period, the one-step tolerance, the lock thresholds and the recovery-code count,
 * so the adapter cannot quietly widen them.
 */
export interface StaffCredentialPort {
  findByUsername(username: string): Promise<StaffCredentialState | null>;

  findByStaffUserId(staffUserId: string): Promise<StaffCredentialState | null>;

  /**
   * Compares a password against the stored Argon2id hash.
   *
   * A `null` credential performs the same-cost dummy comparison, so an unknown username and a wrong
   * password take the same work and no answer reveals which was which (`C-092`).
   */
  verifyPassword(credentialId: string | null, password: string): Promise<boolean>;

  /**
   * Records one failed authentication and applies the lock rule.
   *
   * The adapter resets the count when the lock window has lapsed, adds one for this failure, and locks
   * the credential for `lockSeconds` once `failedAttemptCount` reaches `lockAttemptLimit`.
   */
  recordFailure(
    credentialId: string,
    input: {
      readonly at: string;
      readonly lockAttemptLimit: number;
      readonly lockWindowSeconds: number;
      readonly lockSeconds: number;
    },
  ): Promise<{ readonly failedAttemptCount: number; readonly lockedUntil?: string }>;

  /** Clears the failure count after a successful step, or when a lock lapses. */
  clearFailures(credentialId: string, at: string): Promise<void>;

  /** Records a successful sign-in on the credential (`lastSignInAt`). */
  recordSignIn(credentialId: string, at: string): Promise<void>;

  /**
   * Issues a pending TOTP secret for one enrolment.
   *
   * The secret is stored encrypted and is never returned by any later call. Beginning an enrolment on
   * an already-enrolled credential is refused by the domain before this method is reached.
   */
  beginTotpEnrolment(
    credentialId: string,
    input: {
      readonly username: string;
      readonly issuer: string;
      readonly algorithm: 'SHA1';
      readonly digits: number;
      readonly periodSeconds: number;
    },
  ): Promise<TotpEnrolment>;

  /**
   * Verifies one code against the pending secret, completes enrolment and issues the recovery codes.
   *
   * @returns The instant enrolment completed and the ten plaintext codes, shown once in this answer,
   *   or `{verified:false}` when the code did not match.
   */
  completeTotpEnrolment(
    credentialId: string,
    input: {
      readonly code: string;
      readonly at: string;
      readonly digits: number;
      readonly periodSeconds: number;
      readonly windowSteps: number;
      readonly recoveryCodeCount: number;
    },
  ): Promise<
    | {
        readonly verified: true;
        readonly enrolledAt: string;
        readonly recoveryCodes: readonly string[];
      }
    | { readonly verified: false }
  >;

  /** Verifies one code against the enrolled secret, with the supplied tolerance. */
  verifyTotp(
    credentialId: string,
    input: {
      readonly code: string;
      readonly at: string;
      readonly digits: number;
      readonly periodSeconds: number;
      readonly windowSteps: number;
    },
  ): Promise<boolean>;

  /** Locates a recovery code, reporting whether it was already spent. Unknown answers `null`. */
  verifyRecoveryCode(
    credentialId: string,
    code: string,
  ): Promise<{ readonly index: number; readonly spent: boolean } | null>;

  /**
   * Marks one recovery code spent.
   *
   * @returns `false` when another request spent it first, which refuses the sign-in rather than
   *   admitting two sessions on one code.
   */
  spendRecoveryCode(credentialId: string, index: number, at: string): Promise<boolean>;
}

/** The staff accounts (`schema.md` StaffUser). */
export interface StaffUserPort {
  get(staffId: string): Promise<StaffUser | null>;

  /** Writes `StaffUser.secondFactorEnrolled`; only `C-092` enrolment confirmation sets it true. */
  setSecondFactorEnrolled(staffId: string, enrolled: boolean, at: string): Promise<void>;
}

/** A rate-limited subject. The adapter derives a non-personal key from it; none is stored raw. */
export type RateLimitSubject =
  | { readonly kind: 'number'; readonly value: string }
  | { readonly kind: 'address'; readonly value: string }
  | { readonly kind: 'member'; readonly value: string }
  | { readonly kind: 'staff'; readonly value: string };

/**
 * The limiter (`NFR-027`).
 *
 * The numeric caps are operator configuration, so they live with the adapter: the domain names the
 * bucket, and a cap the specification fixes is passed as `fixedLimit`.
 */
export interface RateLimitPort {
  consume(input: {
    readonly bucket: string;
    readonly subject: RateLimitSubject;
    /** Only the caps `NFR-027` fixes, such as the three code attempts or the five staff failures. */
    readonly fixedLimit?: number;
  }): Promise<{ readonly allowed: boolean; readonly retryAfterSeconds: number }>;
}

/** One transport key's recorded answer (`C-001` idempotency, `C-092` replay). */
export interface RecordedAnswer {
  readonly fingerprint: string;
  readonly result: unknown;
}

/**
 * The idempotency store for a state-changing call.
 *
 * The domain compares the request fingerprint: a replay of the same payload returns the recorded
 * answer, and the same key with a different payload is refused (`C-001`). A replay must not open a
 * second session, spend a second recovery code or append a second audit event (`C-092`).
 */
export interface IdempotencyPort {
  read(key: string): Promise<RecordedAnswer | null>;
  record(key: string, answer: RecordedAnswer): Promise<void>;
}

/** The durable queue a write falls back to when the primary store cannot take it (`C-001`, `C-035`). */
export interface QueuedWritePort {
  enqueue(input: {
    readonly kind: string;
    readonly idempotencyKey: string;
    readonly at: string;
    /** Identifiers and closed tokens only; never a name, a number or free text. */
    readonly payload: Readonly<Record<string, string>>;
  }): Promise<{
    readonly queuedWriteId: string;
    readonly acceptedAt: string;
    readonly replayBy: string;
  }>;
}

/** One identity event the module emits, named and shaped as `analytics.md` declares. */
export type IdentityAnalyticsEvent =
  | {
      readonly name: 'registration_started';
      readonly properties: AnalyticsPayloads['registration_started'];
    }
  | {
      readonly name: 'number_confirmed';
      readonly properties: AnalyticsPayloads['number_confirmed'];
    }
  | {
      readonly name: 'account_registered';
      readonly properties: AnalyticsPayloads['account_registered'];
    }
  | {
      readonly name: 'sign_in_started';
      readonly properties: AnalyticsPayloads['sign_in_started'];
    }
  | {
      readonly name: 'consent_changed';
      readonly properties: AnalyticsPayloads['consent_changed'];
    }
  | {
      readonly name: 'data_request_created';
      readonly properties: AnalyticsPayloads['data_request_created'];
    };

/**
 * Emits one product event (`C-089`).
 *
 * A rejection is the emitter's to buffer and retry, never a reason to undo the account, the consent or
 * the request that produced the event.
 */
export interface IdentityAnalyticsPort {
  /** @throws when the analytics store did not take the event. */
  emit(event: IdentityAnalyticsEvent): Promise<void>;
}

/** The port bundle every identity use case receives. */
export interface IdentityPorts {
  readonly pendingRegistrations: PendingRegistrationPort;
  readonly codes: VerificationCodePort;
  readonly signInChallenges: SignInChallengePort;
  readonly members: MemberPort;
  readonly consents: ConsentPort;
  readonly dataRequests: DataRequestPort;
  readonly memberContent: MemberContentPort;
  readonly legalHolds: LegalHoldPort;
  readonly memberSessions: MemberSessionPort;
  readonly credentials: StaffCredentialPort;
  readonly staffUsers: StaffUserPort;
  readonly staffSessions: StaffSessionPort;
  readonly objectStore: ObjectStoragePort;
  readonly rateLimits: RateLimitPort;
  readonly idempotency: IdempotencyPort;
  readonly queuedWrites: QueuedWritePort;
  readonly audit: AuditAppendPort;
  readonly analytics: IdentityAnalyticsPort;
  readonly clock: ClockPort;
  readonly identifiers: IdentifierPort;
}

/** The data-request type alias, re-exported so a caller need not reach into `entities.ts`. */
export type { DataRequestType };
