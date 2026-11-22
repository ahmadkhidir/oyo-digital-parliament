/**
 * In-memory ports for the identity tests. Test-only: nothing here is exported from the module barrel.
 *
 * The fakes keep the rules the adapters must keep - a code that is consumed cannot be reused, an
 * anonymised account no longer matches its number, one number resolves to one account, a spent
 * recovery code is refused - so a use-case test exercises the rule it names without a database.
 * `packages/db` proves the SQL side separately.
 */
import type { AuditEventRecord } from '../audit/entities.ts';
import type {
  Consent,
  DataRequest,
  MemberRecord,
  PendingRegistration,
  SignInChallenge,
  StaffCredentialState,
  StaffUser,
} from './entities.ts';
import type {
  HeldBackingRow,
  HeldItemRow,
  IdentityAnalyticsEvent,
  IdentityPorts,
  MemberSubmissionRow,
  OneTimeCodeDeliveryRequest,
  RecordedAnswer,
  ResolvedMemberSession,
  ResolvedStaffSession,
  TotpEnrolment,
} from './ports.ts';

/** The fixed instant every fake answers with (`C-001` form). */
export const FAKE_NOW = '2026-11-18T09:00:00Z';
/** The six-digit code every fake issues unless the test supplies another. */
export const FAKE_CODE = '418302';
/** A six-digit code the fake authenticator accepts, for the second-factor tests. */
export const FAKE_TOTP_CODE = '492013';
/** The password every fake staff credential accepts. */
export const FAKE_PASSWORD = 'market-lantern-river-2026';
/** The cap every fake limiter bucket reports, for the `C-001` header values a refusal carries. */
export const FAKE_RATE_LIMIT = 5;
/** The window every fake limiter bucket reports, in seconds. */
export const FAKE_RATE_WINDOW_SECONDS = 60;

/** One staff credential plus the plaintext material a fake needs to check. */
export interface FakeStaffCredential {
  id: string;
  staffUserId: string;
  username: string;
  /** Test-only: an adapter stores only the Argon2id hash (`NFR-021`). */
  password: string;
  passwordChangedAt: string;
  enrolledAt?: string | undefined;
  failedAttemptCount: number;
  lockedUntil?: string | undefined;
  lastSignInAt?: string | undefined;
  lastFailureAt?: string | undefined;
  recoveryCodes: { code: string; usedAt?: string }[];
  /** The codes the fake authenticator accepts. */
  validTotpCodes: readonly string[];
}

/** One submission row as the fake member content holds it. */
export interface FakeMemberSubmission extends MemberSubmissionRow {
  readonly authorId: string;
}

/** One backing row as the fake holds it. */
export interface FakeHeldBacking extends HeldBackingRow {
  readonly memberId: string;
}

/** What a test passes in. */
export interface IdentityHarnessOptions {
  readonly now?: string;
  readonly code?: string;
  readonly members?: readonly MemberRecord[];
  readonly pending?: readonly PendingRegistration[];
  readonly consents?: readonly Consent[];
  readonly dataRequests?: readonly DataRequest[];
  readonly submissions?: readonly FakeMemberSubmission[];
  readonly heldBackings?: readonly FakeHeldBacking[];
  readonly heldItems?: Readonly<Record<string, readonly HeldItemRow[]>>;
  readonly staff?: readonly StaffUser[];
  readonly credentials?: readonly FakeStaffCredential[];
  readonly legalHoldReviewDate?: string;
  /** Makes the audit append throw, for the failed-append rule (`C-090`, `NFR-028`). */
  readonly auditUnavailable?: boolean;
  /** Makes the analytics emit throw, which must not fail the write (`C-089`). */
  readonly analyticsUnavailable?: boolean;
  /** Makes the primary record store refuse writes, for the queued-write path (`C-035`). */
  readonly primaryStoreUnavailable?: boolean;
  /** Makes every code-store read or write throw (`SERVICE_DEGRADED` paths). */
  readonly codeStoreUnavailable?: boolean;
  /** Makes the SMS dispatch refuse, for the `delayed` and `SMS_CHANNEL_UNAVAILABLE` paths. */
  readonly smsUnavailable?: boolean;
  /** Makes the notification boundary itself unreachable, as a queue that cannot take the call does. */
  readonly notificationsUnavailable?: boolean;
  /** Makes the session store throw. */
  readonly sessionStoreUnavailable?: boolean;
  /** Makes the credential store throw. */
  readonly credentialStoreUnavailable?: boolean;
  /** Makes the object store refuse a signed URL. */
  readonly objectStoreUnavailable?: boolean;
  /** Makes the durable queue refuse. */
  readonly queueUnavailable?: boolean;
  /** Refuses every limiter bucket, with the stated wait. */
  readonly rateLimited?: { readonly retryAfterSeconds: number };
  /** Makes the limiter itself unreachable. */
  readonly rateLimitUnavailable?: boolean;
}

/** The live state a test may inspect after a use case runs. */
export interface IdentityHarness {
  readonly ports: IdentityPorts;
  readonly audit: AuditEventRecord[];
  readonly analytics: IdentityAnalyticsEvent[];
  readonly members: MemberRecord[];
  readonly pending: PendingRegistration[];
  readonly challenges: SignInChallenge[];
  readonly consents: Consent[];
  readonly dataRequests: DataRequest[];
  readonly submissions: FakeMemberSubmission[];
  readonly credentials: FakeStaffCredential[];
  readonly staff: StaffUser[];
  readonly memberSessions: Map<string, ResolvedMemberSession>;
  readonly endedSessionIds: Set<string>;
  readonly staffSessions: Map<string, ResolvedStaffSession>;
  readonly codes: Map<string, { code: string; attempts: number; cooldownUntil?: string }>;
  /** Every message the boundary handed to the SMS double, in order (`C-002`, `C-076`). */
  readonly smsSent: readonly {
    readonly destination: string;
    readonly body: string;
    readonly dedupeKey: string;
  }[];
  /** Every target the code store issued for directly; the use cases must leave this empty. */
  readonly codeIssues: readonly string[];
  /** Every target the boundary rendered a body for, so a stale retry can be proven silent. */
  readonly codeRenders: readonly string[];
  /** The boundary's queue rows, keyed by dedupe key, as no destination and no digits (`C-076`). */
  readonly notificationQueue: ReadonlyMap<
    string,
    {
      readonly queuedAt: string;
      readonly target: 'pending_registration' | 'sign_in';
      readonly targetId: string;
      readonly state: 'queued' | 'sent' | 'failed';
      readonly delivery: { readonly status: 'sent' | 'delayed'; readonly channel: 'sms' };
    }
  >;
  /** Moves the fake clock, for a resend or a retry that happens later than the last call. */
  readonly setNow: (instant: string) => void;
  /** Opens or closes the SMS double, as a provider outage starting or ending does. */
  readonly setSmsUnavailable: (unavailable: boolean) => void;
  readonly idempotency: Map<string, RecordedAnswer>;
  readonly queued: {
    readonly kind: string;
    readonly idempotencyKey: string;
    readonly payload: Readonly<Record<string, string>>;
  }[];
  readonly signedUrlCalls: { readonly key: string; readonly ttlSeconds: number }[];
}

/** A member with every schema field, for tests that vary one. */
export function fakeMember(
  overrides: Partial<MemberRecord> & Pick<MemberRecord, 'id'>,
): MemberRecord {
  return {
    telephoneNumber: '+2348031234567',
    fullName: 'Oluwaseun Adeyemi',
    displayName: 'Seun A.',
    declaredAge: 24,
    wardStatus: 'unresolved',
    identityState: 'registered',
    verificationMethod: 'self_code',
    locale: 'en-NG',
    createdAt: FAKE_NOW,
    ...overrides,
  };
}

/** A staff user with every schema field, for tests that vary one. */
export function fakeStaffUser(overrides: Partial<StaffUser> & Pick<StaffUser, 'id'>): StaffUser {
  return {
    fullName: 'A. Balogun',
    role: 'response_staff',
    external: false,
    authorisedWardIds: [],
    secondFactorEnrolled: true,
    active: true,
    createdAt: FAKE_NOW,
    ...overrides,
  };
}

/** A credential for one staff user, enrolled and accepting the fake codes. */
export function fakeStaffCredential(
  overrides: Partial<FakeStaffCredential> &
    Pick<FakeStaffCredential, 'id' | 'staffUserId' | 'username'>,
): FakeStaffCredential {
  return {
    password: FAKE_PASSWORD,
    passwordChangedAt: FAKE_NOW,
    enrolledAt: FAKE_NOW,
    failedAttemptCount: 0,
    recoveryCodes: [{ code: '5F2C-9A71-KM04-QD7V' }],
    validTotpCodes: [FAKE_TOTP_CODE],
    ...overrides,
  };
}

/** The credential projection the port returns. */
function credentialState(credential: FakeStaffCredential): StaffCredentialState {
  return {
    id: credential.id,
    staffUserId: credential.staffUserId,
    username: credential.username,
    passwordChangedAt: credential.passwordChangedAt,
    ...(credential.enrolledAt === undefined
      ? {}
      : { secondFactorEnrolledAt: credential.enrolledAt }),
    recoveryCodes: credential.recoveryCodes.map((row) =>
      row.usedAt === undefined ? {} : { usedAt: row.usedAt },
    ),
    failedAttemptCount: credential.failedAttemptCount,
    ...(credential.lockedUntil === undefined ? {} : { lockedUntil: credential.lockedUntil }),
    ...(credential.lastSignInAt === undefined ? {} : { lastSignInAt: credential.lastSignInAt }),
  };
}

/** Builds the port bundle and the state a test can assert against. */
export function createIdentityHarness(options: IdentityHarnessOptions = {}): IdentityHarness {
  const now = options.now ?? FAKE_NOW;
  let nowInstant = now;
  let smsUnavailable = options.smsUnavailable === true;
  const members: MemberRecord[] = options.members?.map((member) => ({ ...member })) ?? [];
  const pending: PendingRegistration[] = options.pending?.map((row) => ({ ...row })) ?? [];
  const challenges: SignInChallenge[] = [];
  const consents: Consent[] = options.consents?.map((row) => ({ ...row })) ?? [];
  const dataRequests: DataRequest[] = options.dataRequests?.map((row) => ({ ...row })) ?? [];
  const submissions: FakeMemberSubmission[] = options.submissions?.map((row) => ({ ...row })) ?? [];
  const heldBackings: FakeHeldBacking[] = options.heldBackings?.map((row) => ({ ...row })) ?? [];
  const heldItems = new Map(Object.entries(options.heldItems ?? {}));
  const staff: StaffUser[] = options.staff?.map((row) => ({ ...row })) ?? [];
  const credentials: FakeStaffCredential[] =
    options.credentials?.map((row) => ({
      ...row,
      recoveryCodes: row.recoveryCodes.map((code) => ({ ...code })),
      validTotpCodes: [...row.validTotpCodes],
    })) ?? [];
  const audit: AuditEventRecord[] = [];
  const analytics: IdentityAnalyticsEvent[] = [];
  const codes = new Map<string, { code: string; attempts: number; cooldownUntil?: string }>();
  /** One row per dedupe key, as the boundary's queue would hold it (`C-076`). */
  const deliveries = new Map<
    string,
    {
      readonly queuedAt: string;
      readonly target: 'pending_registration' | 'sign_in';
      readonly targetId: string;
      state: 'queued' | 'sent' | 'failed';
      delivery: { readonly status: 'sent' | 'delayed'; readonly channel: 'sms' };
    }
  >();
  const codeIssues: string[] = [];
  const codeRenders: string[] = [];
  const smsSent: { destination: string; body: string; dedupeKey: string }[] = [];
  const memberSessions = new Map<string, ResolvedMemberSession>();
  const endedSessionIds = new Set<string>();
  const staffSessions = new Map<string, ResolvedStaffSession>();
  const idempotency = new Map<string, RecordedAnswer>();
  const queued: {
    kind: string;
    idempotencyKey: string;
    payload: Readonly<Record<string, string>>;
  }[] = [];
  const signedUrlCalls: { key: string; ttlSeconds: number }[] = [];
  let identifierCounter = 0;
  let sequence = 0;
  let sessionCounter = 0;

  const guard = (flag: boolean | undefined, message: string): void => {
    if (flag === true) throw new Error(message);
  };

  /**
   * Whether a message queued at `queuedAt` may still mint a code for its target (`C-076`).
   *
   * A newer issue for the same target — a registration resend, or a fresh sign-in request — moves the
   * target's `codeSentAt` past the queued instant, so the older message is superseded. A target that is
   * gone or already used has nothing left to prove, so its queued message is finished too.
   */
  async function isCurrentCode(
    target: 'pending_registration' | 'sign_in',
    targetId: string,
    queuedAt: string,
  ): Promise<boolean> {
    let issuedAt: string | undefined;
    if (target === 'pending_registration') {
      const row = pending.find((candidate) => candidate.id === targetId);
      if (row !== undefined && row.verifiedAt === undefined) issuedAt = row.codeSentAt;
    } else {
      const row = challenges.find((candidate) => candidate.id === targetId);
      if (row !== undefined && row.consumedAt === undefined) issuedAt = row.codeSentAt;
    }
    if (issuedAt === undefined) return false;
    return Date.parse(issuedAt) <= Date.parse(queuedAt);
  }

  const ports: IdentityPorts = {
    pendingRegistrations: {
      async create(row) {
        guard(options.primaryStoreUnavailable, 'the store is unavailable');
        pending.push({ ...row });
      },
      async findById(pendingId) {
        return pending.find((row) => row.id === pendingId) ?? null;
      },
      async markVerified(pendingId, at) {
        const index = pending.findIndex((row) => row.id === pendingId);
        const row = pending[index];
        if (row !== undefined) pending[index] = { ...row, verifiedAt: at };
      },
      async recordCodeSent(pendingId, at) {
        const index = pending.findIndex((row) => row.id === pendingId);
        const row = pending[index];
        if (row !== undefined) pending[index] = { ...row, codeSentAt: at };
      },
    },

    codes: {
      async issue(input) {
        guard(options.codeStoreUnavailable, 'the code store is unavailable');
        guard(smsUnavailable, 'the sms gateway is unavailable');
        codeIssues.push(input.targetId);
        codes.set(input.targetId, { code: options.code ?? FAKE_CODE, attempts: 0 });
        return { status: 'sent', channel: 'sms' };
      },
      async renderOutstanding(input) {
        guard(options.codeStoreUnavailable, 'the code store is unavailable');
        // The fake mints as it renders, as the adapter does: the digits live in this answer only, and a
        // second render voids the first code (`C-076` body rendered at send time).
        const code = options.code ?? FAKE_CODE;
        codeRenders.push(input.targetId);
        codes.set(input.targetId, { code, attempts: 0 });
        return `Your Oyo Digital Parliament code is ${code}.`;
      },
      async matches(targetId, code) {
        guard(options.codeStoreUnavailable, 'the code store is unavailable');
        const entry = codes.get(targetId);
        // A consumed or never-issued code leaves nothing to compare, exactly as the adapter's digest
        // key does; only a live code can be guessed wrong (`C-003`, `C-006`).
        if (entry === undefined || entry.code === '') return 'absent';
        return entry.code === code.replace(/\s+/g, '') ? 'match' : 'mismatch';
      },
      async consume(targetId) {
        guard(options.codeStoreUnavailable, 'the code store is unavailable');
        const entry = codes.get(targetId);
        if (entry !== undefined) codes.set(targetId, { ...entry, code: '' });
      },
      async readAttempts(targetId) {
        guard(options.codeStoreUnavailable, 'the code store is unavailable');
        const entry = codes.get(targetId);
        return {
          attempts: entry?.attempts ?? 0,
          ...(entry?.cooldownUntil === undefined ? {} : { cooldownUntil: entry.cooldownUntil }),
        };
      },
      async recordFailure(targetId, at) {
        guard(options.codeStoreUnavailable, 'the code store is unavailable');
        const entry = codes.get(targetId) ?? { code: '', attempts: 0 };
        const attempts = entry.attempts + 1;
        codes.set(targetId, { ...entry, attempts });
        void at;
        return attempts;
      },
      async startCooldown(targetId, until) {
        guard(options.codeStoreUnavailable, 'the code store is unavailable');
        const entry = codes.get(targetId) ?? { code: '', attempts: 0 };
        codes.set(targetId, { ...entry, cooldownUntil: until });
      },
    },

    notifications: {
      async deliverCode(input: OneTimeCodeDeliveryRequest) {
        // `C-076`: the boundary owns the queue. An unreachable queue is a failed call, not a silent
        // hold; the caller decides whether its own write still stands.
        guard(options.notificationsUnavailable, 'the notification boundary is unreachable');

        const existing = deliveries.get(input.dedupeKey);
        // A finished message reports its recorded outcome, so a replay sends nothing a second time.
        if (existing !== undefined && existing.state !== 'queued') return existing.delivery;

        const registration = input.memberId === undefined;
        const targetId = input.pendingRegistrationId;
        const queuedAt = existing?.queuedAt ?? nowInstant;

        let destination: string | null = null;
        let locale = input.locale;
        if (registration) {
          const row = pending.find((candidate) => candidate.id === targetId);
          if (row !== undefined && row.verifiedAt === undefined) {
            destination = row.telephoneNumber;
            locale = row.locale;
          }
        } else {
          const member = members.find(
            (candidate) => candidate.id === input.memberId && candidate.deletedAt === undefined,
          );
          if (member !== undefined) {
            destination = member.telephoneNumber;
            locale = member.locale;
          }
        }

        const record = (
          state: 'queued' | 'sent' | 'failed',
          delivery: { readonly status: 'sent' | 'delayed'; readonly channel: 'sms' },
        ) => {
          deliveries.set(input.dedupeKey, {
            queuedAt,
            target: registration ? 'pending_registration' : 'sign_in',
            targetId,
            state,
            delivery,
          });
          return delivery;
        };

        if (destination === null || smsUnavailable) {
          // Held, not lost: the row stays queued for its next attempt, and nothing was rendered.
          return record('queued', { status: 'delayed', channel: 'sms' });
        }
        // A newer code for this target supersedes a message that was queued before it: rendering this
        // one would void the code the newer message delivered, so the message is finished instead.
        if (!(await isCurrentCode(registration ? 'pending_registration' : 'sign_in', targetId, queuedAt))) {
          return record('failed', { status: 'delayed', channel: 'sms' });
        }

        // The body is the code store's, minted at send time; the destination comes from the record and
        // never travels back out of this call.
        const body = await ports.codes.renderOutstanding({ targetId, locale });
        smsSent.push({ destination, body, dedupeKey: input.dedupeKey });
        return record('sent', { status: 'sent', channel: 'sms' });
      },
    },

    signInChallenges: {
      async create(input) {
        challenges.push({
          id: input.id,
          telephoneNumber: input.telephoneNumber,
          memberIds: [...input.memberIds],
          codeSentAt: input.at,
          expiresAt: input.expiresAt,
        });
        const attempt = challenges.filter(
          (row) => row.telephoneNumber === input.telephoneNumber,
        ).length;
        return { attempt };
      },
      async findById(challengeId) {
        return challenges.find((row) => row.id === challengeId) ?? null;
      },
      async consume(challengeId, at) {
        const index = challenges.findIndex((row) => row.id === challengeId);
        const row = challenges[index];
        if (row === undefined || row.consumedAt !== undefined) return false;
        challenges[index] = { ...row, consumedAt: at };
        return true;
      },
    },

    members: {
      async findByTelephone(telephoneNumber) {
        return members.filter(
          (member) => member.telephoneNumber === telephoneNumber && member.deletedAt === undefined,
        );
      },
      async get(memberId) {
        return members.find((member) => member.id === memberId) ?? null;
      },
      async create(member) {
        guard(options.primaryStoreUnavailable, 'the store is unavailable');
        members.push({ ...member });
      },
      async updateProfile(memberId, input) {
        const index = members.findIndex((member) => member.id === memberId);
        const member = members[index];
        if (member === undefined) throw new Error('no such member');
        members[index] = { ...member, ...input };
      },
      async isDisplayNameTaken(displayName, exceptMemberId) {
        return members.some(
          (member) =>
            member.id !== exceptMemberId &&
            member.deletedAt === undefined &&
            member.displayName.toLowerCase() === displayName.toLowerCase(),
        );
      },
      async anonymise(memberId, at) {
        const index = members.findIndex((member) => member.id === memberId);
        const member = members[index];
        if (member === undefined) throw new Error('no such member');
        members[index] = {
          ...member,
          telephoneNumber: '',
          fullName: '',
          declaredAge: 18,
          deletedAt: at,
        };
      },
      async countAuthoredContent(memberId) {
        return {
          submissions: submissions.filter((row) => row.authorId === memberId).length,
          comments: 0,
        };
      },
    },

    consents: {
      async listForMember(memberId) {
        return consents.filter((row) => row.memberId === memberId);
      },
      async latestForPurpose(memberId, purpose) {
        const matches = consents.filter(
          (row) => row.memberId === memberId && row.purpose === purpose,
        );
        return matches.length === 0 ? null : (matches[matches.length - 1] ?? null);
      },
      async create(consent) {
        guard(options.primaryStoreUnavailable, 'the store is unavailable');
        consents.push({ ...consent });
      },
      async withdraw(consentId, at) {
        const index = consents.findIndex((row) => row.id === consentId);
        const row = consents[index];
        if (row === undefined) throw new Error('no such consent');
        consents[index] = { ...row, granted: false, withdrawnAt: at };
      },
    },

    dataRequests: {
      async listForMember(memberId) {
        return dataRequests.filter((row) => row.memberId === memberId);
      },
      async findOpenExport(memberId) {
        return (
          dataRequests.find(
            (row) =>
              row.memberId === memberId &&
              row.type === 'export' &&
              (row.status === 'received' || row.status === 'in_progress'),
          ) ?? null
        );
      },
      async findById(requestId) {
        return dataRequests.find((row) => row.id === requestId) ?? null;
      },
      async create(request) {
        guard(options.primaryStoreUnavailable, 'the store is unavailable');
        dataRequests.push({ ...request });
      },
    },

    memberContent: {
      async listSubmissions(memberId, query) {
        const rows = submissions.filter((row) => row.authorId === memberId);
        const offset = parseCursor(query.cursor);
        const page = rows.slice(offset, offset + query.limit);
        const nextOffset = offset + page.length;
        return {
          rows: page.map((row) => ({
            reference: row.reference,
            status: row.status,
            decision: row.decision,
          })),
          nextCursor:
            nextOffset < rows.length ? `cur_${String(nextOffset).padStart(4, '0')}` : null,
        };
      },
      async listHeldBackings(memberId) {
        return heldBackings
          .filter((row) => row.memberId === memberId)
          .map((row) => ({
            submissionReference: row.submissionReference,
            submissionStatus: row.submissionStatus,
            backingState: row.backingState,
          }));
      },
      async listHeldItems(memberId) {
        return heldItems.get(memberId) ?? [];
      },
      async withdrawAuthoredSubmissions(memberId, at) {
        let moved = 0;
        for (let index = 0; index < submissions.length; index += 1) {
          const row = submissions[index];
          if (row === undefined || row.authorId !== memberId) continue;
          if (row.status === 'withdrawn') continue;
          submissions[index] = { ...row, status: 'withdrawn' };
          moved += 1;
        }
        void at;
        return moved;
      },
    },

    legalHolds: {
      async findOpenForMember(memberId) {
        void memberId;
        return options.legalHoldReviewDate === undefined
          ? null
          : { reviewDate: options.legalHoldReviewDate };
      },
    },

    memberSessions: {
      async create(input) {
        guard(options.sessionStoreUnavailable, 'the session store is unavailable');
        sessionCounter += 1;
        const sessionId = `ses_member_${sessionCounter}`;
        memberSessions.set(sessionId, {
          sessionId,
          memberId: input.memberId,
          expiresAt: input.expiresAt,
          absoluteExpiresAt: input.absoluteExpiresAt,
          lastSeenAt: input.at,
        });
        return { sessionId };
      },
      async read(token) {
        guard(options.sessionStoreUnavailable, 'the session store is unavailable');
        if (endedSessionIds.has(token)) return null;
        return memberSessions.get(token) ?? null;
      },
      async end(sessionId) {
        guard(options.sessionStoreUnavailable, 'the session store is unavailable');
        endedSessionIds.add(sessionId);
      },
    },

    credentials: {
      async findByUsername(username) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const row = credentials.find((credential) => credential.username === username);
        return row === undefined ? null : credentialState(row);
      },
      async findByStaffUserId(staffUserId) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const row = credentials.find((credential) => credential.staffUserId === staffUserId);
        return row === undefined ? null : credentialState(row);
      },
      async verifyPassword(credentialId, password) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        if (credentialId === null) return false;
        const row = credentials.find((credential) => credential.id === credentialId);
        return row !== undefined && row.password === password;
      },
      async recordFailure(credentialId, input) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const index = credentials.findIndex((credential) => credential.id === credentialId);
        const row = credentials[index];
        if (row === undefined) throw new Error('no such credential');
        const windowLapsed =
          row.lastFailureAt === undefined ||
          Date.parse(input.at) - Date.parse(row.lastFailureAt) > input.lockWindowSeconds * 1000;
        const failedAttemptCount = (windowLapsed ? 0 : row.failedAttemptCount) + 1;
        const lockedUntil =
          failedAttemptCount >= input.lockAttemptLimit
            ? new Date(Date.parse(input.at) + input.lockSeconds * 1000)
                .toISOString()
                .replace(/\.\d{3}Z$/, 'Z')
            : undefined;
        credentials[index] = {
          ...row,
          failedAttemptCount,
          lastFailureAt: input.at,
          ...(lockedUntil === undefined ? {} : { lockedUntil }),
        };
        return {
          failedAttemptCount,
          ...(lockedUntil === undefined ? {} : { lockedUntil }),
        };
      },
      async clearFailures(credentialId, at) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const index = credentials.findIndex((credential) => credential.id === credentialId);
        const row = credentials[index];
        if (row === undefined) return;
        credentials[index] = {
          ...row,
          failedAttemptCount: 0,
          lastFailureAt: at,
          lockedUntil: undefined,
        };
      },
      async recordSignIn(credentialId, at) {
        const index = credentials.findIndex((credential) => credential.id === credentialId);
        const row = credentials[index];
        if (row !== undefined) credentials[index] = { ...row, lastSignInAt: at };
      },
      async beginTotpEnrolment(credentialId, input) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const index = credentials.findIndex((credential) => credential.id === credentialId);
        const row = credentials[index];
        if (row === undefined) throw new Error('no such credential');
        const secret = 'JBSWY3DPEHPK3PXP';
        const enrolment: TotpEnrolment = {
          otpauthUri: `otpauth://totp/${encodeURIComponent(input.issuer)}:${input.username}?secret=${secret}&issuer=${encodeURIComponent(input.issuer)}&algorithm=SHA1&digits=${input.digits}&period=${input.periodSeconds}`,
          secret,
          algorithm: 'SHA1',
          digits: input.digits,
          periodSeconds: input.periodSeconds,
        };
        return enrolment;
      },
      async completeTotpEnrolment(credentialId, input) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const index = credentials.findIndex((credential) => credential.id === credentialId);
        const row = credentials[index];
        if (row === undefined) throw new Error('no such credential');
        if (!row.validTotpCodes.includes(input.code)) return { verified: false };
        const recoveryCodes = Array.from(
          { length: input.recoveryCodeCount },
          (_, position) => `FAKE-CODE-${String(position + 1).padStart(2, '0')}`,
        );
        credentials[index] = {
          ...row,
          enrolledAt: input.at,
          recoveryCodes: recoveryCodes.map((code) => ({ code })),
        };
        return { verified: true, enrolledAt: input.at, recoveryCodes };
      },
      async verifyTotp(credentialId, input) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const row = credentials.find((credential) => credential.id === credentialId);
        return row !== undefined && row.validTotpCodes.includes(input.code);
      },
      async verifyRecoveryCode(credentialId, code) {
        guard(options.credentialStoreUnavailable, 'the credential store is unavailable');
        const row = credentials.find((credential) => credential.id === credentialId);
        if (row === undefined) return null;
        const index = row.recoveryCodes.findIndex((entry) => entry.code === code);
        if (index === -1) return null;
        return { index, spent: row.recoveryCodes[index]?.usedAt !== undefined };
      },
      async spendRecoveryCode(credentialId, index, at) {
        const rowIndex = credentials.findIndex((credential) => credential.id === credentialId);
        const row = credentials[rowIndex];
        if (row === undefined) return false;
        const entry = row.recoveryCodes[index];
        if (entry === undefined) return false;
        if (entry.usedAt !== undefined) return false;
        const next = row.recoveryCodes.map((code, position) =>
          position === index ? { ...code, usedAt: at } : code,
        );
        credentials[rowIndex] = { ...row, recoveryCodes: next };
        return true;
      },
    },

    staffUsers: {
      async get(staffId) {
        return staff.find((row) => row.id === staffId) ?? null;
      },
      async setSecondFactorEnrolled(staffId, enrolled, at) {
        const index = staff.findIndex((row) => row.id === staffId);
        const row = staff[index];
        if (row === undefined) return;
        staff[index] = { ...row, secondFactorEnrolled: enrolled };
        void at;
      },
    },

    staffSessions: {
      async create(input) {
        guard(options.sessionStoreUnavailable, 'the session store is unavailable');
        sessionCounter += 1;
        const sessionId = `ses_staff_${sessionCounter}`;
        staffSessions.set(sessionId, {
          sessionId,
          staffId: input.staffId,
          secondFactorSatisfied: false,
          startedAt: input.at,
          expiresAt: input.expiresAt,
          absoluteExpiresAt: input.absoluteExpiresAt,
          lastSeenAt: input.at,
        });
        return { sessionId };
      },
      async read(token) {
        guard(options.sessionStoreUnavailable, 'the session store is unavailable');
        if (endedSessionIds.has(token)) return null;
        return staffSessions.get(token) ?? null;
      },
      async upgrade(sessionId, input) {
        const row = staffSessions.get(sessionId);
        if (row === undefined) throw new Error('no such session');
        staffSessions.set(sessionId, {
          ...row,
          secondFactorSatisfied: input.secondFactorSatisfied,
          expiresAt: input.expiresAt,
          absoluteExpiresAt: input.absoluteExpiresAt,
          lastSeenAt: input.at,
        });
      },
      async end(sessionId) {
        guard(options.sessionStoreUnavailable, 'the session store is unavailable');
        endedSessionIds.add(sessionId);
      },
      async endAllForStaff(staffUserId) {
        // `C-093` reports how many sessions the reset ended, so the double counts rather than
        // answering a bare success; a second sweep finds nothing and answers zero.
        let ended = 0;
        for (const [sessionId, row] of staffSessions) {
          if (row.staffId !== staffUserId) continue;
          if (endedSessionIds.has(sessionId)) continue;
          endedSessionIds.add(sessionId);
          ended += 1;
        }
        return ended;
      },
    },

    objectStore: {
      async put() {
        throw new Error('the fake object store does not write');
      },
      async get() {
        return null;
      },
      async delete() {
        return { deleted: false };
      },
      async signedReadUrl(key, ttlSeconds) {
        guard(options.objectStoreUnavailable, 'the object store is unavailable');
        signedUrlCalls.push({ key, ttlSeconds });
        return `https://storage.test/${key}?sig=fake&ttl=${ttlSeconds}`;
      },
    },

    rateLimits: {
      async consume() {
        guard(options.rateLimitUnavailable, 'the limiter is unavailable');
        // The adapter always reports its cap, remainder and reset, so the double does too: a refusal
        // built from this answer can be rendered as the `C-001` headers without a second consult.
        const resetAt = new Date(Date.parse(nowInstant) + FAKE_RATE_WINDOW_SECONDS * 1000)
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z');
        return options.rateLimited === undefined
          ? {
              allowed: true,
              retryAfterSeconds: 0,
              limit: FAKE_RATE_LIMIT,
              remaining: FAKE_RATE_LIMIT - 1,
              resetAt,
            }
          : {
              allowed: false,
              retryAfterSeconds: options.rateLimited.retryAfterSeconds,
              limit: FAKE_RATE_LIMIT,
              remaining: 0,
              resetAt,
            };
      },
    },

    idempotency: {
      async read(key) {
        return idempotency.get(key) ?? null;
      },
      async record(key, answer) {
        idempotency.set(key, answer);
      },
    },

    queuedWrites: {
      async enqueue(input) {
        guard(options.queueUnavailable, 'the queue is unavailable');
        queued.push({
          kind: input.kind,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload,
        });
        return {
          queuedWriteId: `qwr_${String(queued.length).padStart(4, '0')}`,
          acceptedAt: input.at,
          replayBy: new Date(Date.parse(input.at) + 24 * 60 * 60 * 1000)
            .toISOString()
            .replace(/\.\d{3}Z$/, 'Z'),
        };
      },
    },

    audit: {
      async append(event, correlation) {
        void correlation;
        guard(options.auditUnavailable, 'the audit log is unavailable');
        sequence += 1;
        audit.push({ ...event });
        return { sequence };
      },
    },

    analytics: {
      async emit(event) {
        guard(options.analyticsUnavailable, 'the analytics store is down');
        analytics.push(event);
      },
    },

    clock: {
      now: () => new Date(Date.parse(nowInstant)),
    },

    identifiers: {
      next: (prefix) => {
        identifierCounter += 1;
        return `${prefix}_${identifierCounter.toString(36).toUpperCase().padStart(4, '0')}`;
      },
    },
  };

  return {
    ports,
    audit,
    analytics,
    members,
    pending,
    challenges,
    consents,
    dataRequests,
    submissions,
    credentials,
    staff,
    memberSessions,
    endedSessionIds,
    staffSessions,
    codes,
    smsSent,
    codeIssues,
    codeRenders,
    notificationQueue: deliveries,
    setNow: (instant: string) => {
      nowInstant = instant;
    },
    setSmsUnavailable: (unavailable: boolean) => {
      smsUnavailable = unavailable;
    },
    idempotency,
    queued,
    signedUrlCalls,
  };
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const parsed = Number.parseInt(cursor.replace(/^cur_/, ''), 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}
