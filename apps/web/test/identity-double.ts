/**
 * An in-memory identity port bundle for the web area's action tests.
 *
 * The actions under test call the `@odp/domain` use cases through the composed bundle, so the
 * test double must satisfy the whole `IdentityPorts` shape. It keeps only what `C-002` to `C-004`
 * touch — the pending registrations, the members, the codes, the member sessions, the limiter,
 * the audit log, the analytics emitter, the clock and the identifiers — and refuses everything
 * else, exactly as the production composition does for the ports later tasks wire.
 *
 * The domain's own fakes prove the rules; this double exists so the web layer's validation,
 * mapping and cookie flow can be exercised against the real use cases without a database, a Redis
 * or an SMS gateway.
 */
import type {
  AuditEventRecord,
  CodeAttempts,
  IdentityAnalyticsEvent,
  IdentityPorts,
  MemberRecord,
  PendingRegistration,
} from '@odp/domain';

/** The fixed instant every double answers with, in `C-001` form. */
export const FIXED_NOW = '2026-11-18T09:00:00Z';

/** The six-digit code the double's store issues. */
export const DOUBLE_CODE = '418302';

/** A session token the cookie contract accepts (opaque base64url, long enough). */
export const DOUBLE_SESSION_TOKEN = 'sessiontoken0123456789abcdef';

/** What a test controls, at the grain the screen states need. */
export interface PortsDoubleOptions {
  /** Accounts already on the record; one on the tested number makes registration refuse it. */
  readonly members?: readonly MemberRecord[];
  /** Makes every code dispatch throw, for the held-dispatch (`delayed`) path (`C-002`). */
  readonly smsUnavailable?: boolean;
  /** Makes every limiter bucket refuse, with this wait (`NFR-027`). */
  readonly rateLimitRetryAfterSeconds?: number;
}

/** The live state a test may inspect after an action ran. */
export interface PortsDouble {
  readonly ports: IdentityPorts;
  readonly pending: Map<string, PendingRegistration>;
  readonly members: MemberRecord[];
  readonly sessions: Map<string, string>;
  readonly audit: AuditEventRecord[];
  readonly events: IdentityAnalyticsEvent[];
  readonly codes: Map<string, { code: string; attempts: number; cooldownUntil?: string }>;
}

/** A member row a test can seed without spelling the whole record. */
export function doubleMember(overrides: Partial<MemberRecord>): MemberRecord {
  return {
    id: 'mbr_DOUBLE0000000000000000000001',
    telephoneNumber: '+2348031234567',
    fullName: 'Seeded Member',
    displayName: 'Seeded M.',
    declaredAge: 24,
    wardStatus: 'unresolved',
    identityState: 'registered',
    verificationMethod: 'self_code',
    sharedNumber: false,
    locale: 'en-NG',
    createdAt: FIXED_NOW,
    ...overrides,
  };
}

/** Builds the double. */
export function createPortsDouble(options: PortsDoubleOptions = {}): PortsDouble {
  const pending = new Map<string, PendingRegistration>();
  const members: MemberRecord[] = [...(options.members ?? [])];
  const sessions = new Map<string, string>();
  const audit: AuditEventRecord[] = [];
  const events: IdentityAnalyticsEvent[] = [];
  const codes = new Map<string, { code: string; attempts: number; cooldownUntil?: string }>();
  const takenNames = new Set(members.map((member) => member.displayName));

  let sequence = 0;
  const identifier = (prefix: string): string => {
    sequence += 1;
    return `${prefix}_DOUBLE${sequence.toString().padStart(20, '0')}`;
  };

  const limiter = {
    allowed: options.rateLimitRetryAfterSeconds === undefined,
    retryAfterSeconds: options.rateLimitRetryAfterSeconds ?? 0,
  };

  const refused = (effect: string): never => {
    throw new Error(`${effect} is not wired in this test double`);
  };

  const ports: IdentityPorts = {
    pendingRegistrations: {
      create: async (record) => {
        pending.set(record.id, record);
      },
      findById: async (id) => pending.get(id) ?? null,
      markVerified: async (id, at) => {
        const record = pending.get(id);
        if (record !== undefined) pending.set(id, { ...record, verifiedAt: at });
      },
      recordCodeSent: async (id, at) => {
        const record = pending.get(id);
        if (record !== undefined) pending.set(id, { ...record, codeSentAt: at });
      },
    },
    codes: {
      issue: async (input) => {
        if (options.smsUnavailable === true) {
          throw new Error('the one-time code could not be delivered');
        }
        codes.set(input.targetId, { code: DOUBLE_CODE, attempts: 0 });
        return { status: 'sent', channel: 'sms' };
      },
      matches: async (targetId, code): Promise<'match' | 'mismatch' | 'absent'> => {
        const stored = codes.get(targetId);
        if (stored === undefined) return 'absent';
        return stored.code === code ? 'match' : 'mismatch';
      },
      consume: async (targetId) => {
        codes.delete(targetId);
      },
      readAttempts: async (targetId): Promise<CodeAttempts> => {
        const stored = codes.get(targetId);
        return {
          attempts: stored?.attempts ?? 0,
          ...(stored?.cooldownUntil === undefined ? {} : { cooldownUntil: stored.cooldownUntil }),
        };
      },
      recordFailure: async (targetId) => {
        const stored = codes.get(targetId);
        const attempts = (stored?.attempts ?? 0) + 1;
        codes.set(targetId, { code: stored?.code ?? '', attempts });
        return attempts;
      },
      startCooldown: async (targetId, until) => {
        const stored = codes.get(targetId);
        if (stored !== undefined) codes.set(targetId, { ...stored, cooldownUntil: until });
      },
    },
    members: {
      findByTelephone: async (telephoneNumber) =>
        members.filter((member) => member.telephoneNumber === telephoneNumber),
      get: async () => null,
      create: async (member) => {
        members.push(member);
        takenNames.add(member.displayName);
      },
      markSharedNumber: async (telephoneNumber) => {
        for (const [index, member] of members.entries()) {
          if (member.telephoneNumber === telephoneNumber) {
            members[index] = { ...member, sharedNumber: true };
          }
        }
      },
      updateProfile: () => refused('the member profile write'),
      isDisplayNameTaken: async (displayName) => takenNames.has(displayName),
      anonymise: () => refused('the member anonymisation'),
      countAuthoredContent: () => refused('the member content count'),
    },
    memberSessions: {
      create: async (input) => {
        sessions.set(DOUBLE_SESSION_TOKEN, input.memberId);
        return { sessionId: DOUBLE_SESSION_TOKEN };
      },
      read: async () => null,
      end: async () => undefined,
    },
    rateLimits: {
      consume: async () => ({
        allowed: limiter.allowed,
        retryAfterSeconds: limiter.retryAfterSeconds,
        limit: 5,
        remaining: limiter.allowed ? 4 : 0,
        resetAt: FIXED_NOW,
      }),
    },
    audit: {
      append: async (event) => {
        audit.push(event);
        sequence += 1;
        return { sequence };
      },
    },
    analytics: {
      emit: async (event) => {
        events.push(event);
      },
    },
    clock: { now: () => new Date(FIXED_NOW) },
    identifiers: { next: identifier },

    // The remaining ports are type-complete and refused, as in the production composition: this
    // flow never reaches them.
    signInChallenges: new Proxy(
      {},
      { get: () => () => refused('the sign-in challenges') },
    ) as IdentityPorts['signInChallenges'],
    consents: new Proxy(
      {},
      { get: () => () => refused('the consents') },
    ) as IdentityPorts['consents'],
    dataRequests: new Proxy(
      {},
      { get: () => () => refused('the data requests') },
    ) as IdentityPorts['dataRequests'],
    memberContent: new Proxy(
      {},
      { get: () => () => refused('the member content') },
    ) as IdentityPorts['memberContent'],
    legalHolds: new Proxy(
      {},
      { get: () => () => refused('the legal holds') },
    ) as IdentityPorts['legalHolds'],
    staffUsers: new Proxy(
      {},
      { get: () => () => refused('the staff users') },
    ) as IdentityPorts['staffUsers'],
    credentials: new Proxy(
      {},
      { get: () => () => refused('the staff credentials') },
    ) as IdentityPorts['credentials'],
    staffSessions: new Proxy(
      {},
      { get: () => () => refused('the staff sessions') },
    ) as IdentityPorts['staffSessions'],
    objectStore: new Proxy(
      {},
      { get: () => () => refused('the object store') },
    ) as IdentityPorts['objectStore'],
    idempotency: new Proxy(
      {},
      { get: () => () => refused('the idempotency store') },
    ) as IdentityPorts['idempotency'],
    queuedWrites: new Proxy(
      {},
      { get: () => () => refused('the write queue') },
    ) as IdentityPorts['queuedWrites'],
  };

  return { ports, pending, members, sessions, audit, events, codes };
}
