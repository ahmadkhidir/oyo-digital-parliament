/**
 * The member and staff session stores over Redis (`NFR-026`, `C-003`, `C-006` to `C-008`, `C-092`).
 *
 * A session token is 32 random bytes in base64url form. Only its SHA-256 digest reaches Redis, so a
 * dump of the store cannot be replayed as a cookie, and the key is never derived from the member or
 * staff identifier. The record beside the key carries what a read needs: whose session it is, when it
 * was opened, whether the second factor is satisfied, and when it ends.
 *
 * The idle timeout is a sliding window and the absolute timeout is a wall: every read renews the idle
 * expiry up to the absolute one and never past it. The window the caller passes in is the ceiling the
 * domain computed; this adapter can shorten it to the configured idle timeout but never extend it.
 *
 * `read` returns the token itself as `sessionId`, because the token is the bearer value the transport
 * puts in the cookie and the same value ends the session. No other copy of it is stored.
 *
 * @module adapters/session/redis/sessions
 */
import { randomBytes } from 'node:crypto';

import type {
  MemberSessionPort,
  ResolvedMemberSession,
  ResolvedStaffSession,
  StaffSessionPort,
} from '../../../../../domain/src/identity/ports.ts';
import type { ClockPort } from '../../../../../domain/src/ports/clock.ts';
import type { SessionStore } from '../../../ports/session-store.ts';
import { digestSessionToken, sessionKey, staffSessionIndexKey } from './keys.ts';

/** How many random bytes a session token carries. 256 bits is not enumerable. */
const TOKEN_BYTES = 32;

/** The stored member session. */
interface MemberSessionRecord {
  readonly v: 1;
  readonly memberId: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly absoluteExpiresAt: string;
}

/** The stored staff session, including the password step's instant that anchors the absolute window. */
interface StaffSessionRecord {
  readonly v: 1;
  readonly staffId: string;
  readonly secondFactorSatisfied: boolean;
  readonly startedAt: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly absoluteExpiresAt: string;
}

/** Raised when a session being upgraded no longer exists, because it expired or was ended. */
export class SessionNotFoundError extends Error {
  constructor() {
    super('the session is no longer live');
    this.name = 'SessionNotFoundError';
  }
}

/** Whole seconds between two instants, never below one: a zero-second entry would be a silent loss. */
function lifetimeSeconds(now: string, expiresAt: string, absoluteExpiresAt: string): number {
  const endsAt = Math.min(Date.parse(expiresAt), Date.parse(absoluteExpiresAt));
  const seconds = Math.ceil((endsAt - Date.parse(now)) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    throw new RangeError('a session window must end in the future');
  }
  return seconds;
}

/**
 * The earlier of two instants, in `C-001` form.
 *
 * An idle window can shorten the window the caller passed in but never extend it, which is how the
 * configured idle timeout is enforced on a session that is opened and then left alone.
 */
function earlier(first: string, second: string): string {
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

/** Whether the clock has reached an instant. */
function reached(instant: string, now: number): boolean {
  return Date.parse(instant) <= now;
}

/**
 * Issue one opaque session token.
 *
 * `randomBytes` rather than the identifier factory: an identifier is time-prefixed and ordered, which
 * is exactly what a bearer secret must not be. This is the only random draw in the session adapter.
 */
function issueToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Parse a stored record, treating a malformed one as absent rather than crashing a sign-in. */
function parseRecord<T extends { readonly v: 1 }>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as { readonly v?: unknown };
    return value.v === 1 ? (value as T) : null;
  } catch {
    return null;
  }
}

/** What the member store needs. */
export interface MemberSessionStoreOptions {
  readonly store: SessionStore;
  readonly clock: ClockPort;
  /** The configured idle timeout in seconds. Renewed on every read, capped by the absolute window. */
  readonly idleSeconds: number;
}

/**
 * Create the member session namespace.
 *
 * @param options - The store, the clock and the configured idle timeout.
 */
export function createMemberSessionStore(options: MemberSessionStoreOptions): MemberSessionPort {
  const { store, clock } = options;

  /** Best-effort removal of a session the clock says has ended. */
  const discard = async (key: string): Promise<void> => {
    try {
      await store.delete([key]);
    } catch {
      // The entry's own TTL removes it; a failed cleanup must not change the answer.
    }
  };

  return {
    async create(input) {
      const token = issueToken();
      const key = sessionKey('member', digestSessionToken(token));
      const idleExpiry = new Date(Date.parse(input.at) + options.idleSeconds * 1000).toISOString();
      const expiresAt = earlier(input.expiresAt, idleExpiry);
      const record: MemberSessionRecord = {
        v: 1,
        memberId: input.memberId,
        createdAt: input.at,
        expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
      };
      await store.set(
        key,
        JSON.stringify(record),
        lifetimeSeconds(input.at, expiresAt, input.absoluteExpiresAt),
      );
      return { sessionId: token };
    },

    async read(token): Promise<ResolvedMemberSession | null> {
      if (!isTokenShaped(token)) return null;
      const key = sessionKey('member', digestSessionToken(token));
      const record = parseRecord<MemberSessionRecord>(await store.get(key));
      if (record === null) return null;

      const now = clock.now();
      if (
        reached(record.expiresAt, now.getTime()) ||
        reached(record.absoluteExpiresAt, now.getTime())
      ) {
        await discard(key);
        return null;
      }

      const renewed = new Date(
        Math.min(now.getTime() + options.idleSeconds * 1000, Date.parse(record.absoluteExpiresAt)),
      ).toISOString();
      const lastSeenAt = now.toISOString();
      const next: MemberSessionRecord = { ...record, expiresAt: renewed };
      await store.set(
        key,
        JSON.stringify(next),
        lifetimeSeconds(lastSeenAt, renewed, record.absoluteExpiresAt),
      );

      return {
        sessionId: token,
        memberId: record.memberId,
        expiresAt: renewed,
        absoluteExpiresAt: record.absoluteExpiresAt,
        lastSeenAt,
      };
    },

    async end(sessionId) {
      if (!isTokenShaped(sessionId)) return;
      await store.delete([sessionKey('member', digestSessionToken(sessionId))]);
    },
  };
}

/** What the staff store needs. */
export interface StaffSessionStoreOptions {
  readonly store: SessionStore;
  readonly clock: ClockPort;
  readonly idleSeconds: number;
}

/**
 * Create the staff session namespace.
 *
 * @param options - The store, the clock and the configured idle timeout.
 */
export function createStaffSessionStore(options: StaffSessionStoreOptions): StaffSessionPort {
  const { store, clock } = options;

  const discard = async (key: string): Promise<void> => {
    try {
      await store.delete([key]);
    } catch {
      // As above: the TTL is the backstop.
    }
  };

  return {
    async create(input) {
      const token = issueToken();
      const key = sessionKey('staff', digestSessionToken(token));
      const indexKey = staffSessionIndexKey(input.staffId);
      const idleExpiry = new Date(Date.parse(input.at) + options.idleSeconds * 1000).toISOString();
      const expiresAt = earlier(input.expiresAt, idleExpiry);
      const remaining = lifetimeSeconds(input.at, expiresAt, input.absoluteExpiresAt);
      const record: StaffSessionRecord = {
        v: 1,
        staffId: input.staffId,
        secondFactorSatisfied: false,
        startedAt: input.at,
        createdAt: input.at,
        expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
      };
      await store.set(key, JSON.stringify(record), remaining);
      await store.addToSet(indexKey, key, remaining);
      return { sessionId: token };
    },

    async read(token): Promise<ResolvedStaffSession | null> {
      if (!isTokenShaped(token)) return null;
      const key = sessionKey('staff', digestSessionToken(token));
      const record = parseRecord<StaffSessionRecord>(await store.get(key));
      if (record === null) return null;

      const now = clock.now();
      if (
        reached(record.expiresAt, now.getTime()) ||
        reached(record.absoluteExpiresAt, now.getTime())
      ) {
        await discard(key);
        return null;
      }

      const renewed = new Date(
        Math.min(now.getTime() + options.idleSeconds * 1000, Date.parse(record.absoluteExpiresAt)),
      ).toISOString();
      const lastSeenAt = now.toISOString();
      const next: StaffSessionRecord = { ...record, expiresAt: renewed };
      const remaining = lifetimeSeconds(lastSeenAt, renewed, record.absoluteExpiresAt);
      await store.set(key, JSON.stringify(next), remaining);
      // The index must outlive the session it names, or a reset would miss a live session.
      await store.addToSet(staffSessionIndexKey(record.staffId), key, remaining);

      return {
        sessionId: token,
        staffId: record.staffId,
        secondFactorSatisfied: record.secondFactorSatisfied,
        startedAt: record.startedAt,
        expiresAt: renewed,
        absoluteExpiresAt: record.absoluteExpiresAt,
        lastSeenAt,
      };
    },

    async upgrade(sessionId, input) {
      if (!isTokenShaped(sessionId)) throw new SessionNotFoundError();
      const key = sessionKey('staff', digestSessionToken(sessionId));
      const record = parseRecord<StaffSessionRecord>(await store.get(key));
      if (
        record === null ||
        reached(record.expiresAt, Date.parse(input.at)) ||
        reached(record.absoluteExpiresAt, Date.parse(input.at))
      ) {
        throw new SessionNotFoundError();
      }

      const remaining = lifetimeSeconds(input.at, input.expiresAt, input.absoluteExpiresAt);
      const next: StaffSessionRecord = {
        ...record,
        secondFactorSatisfied: input.secondFactorSatisfied,
        expiresAt: input.expiresAt,
        absoluteExpiresAt: input.absoluteExpiresAt,
      };
      await store.set(key, JSON.stringify(next), remaining);
      await store.addToSet(staffSessionIndexKey(record.staffId), key, remaining);
    },

    async end(sessionId) {
      if (!isTokenShaped(sessionId)) return;
      await store.delete([sessionKey('staff', digestSessionToken(sessionId))]);
    },

    async endAllForStaff(staffUserId) {
      const indexKey = staffSessionIndexKey(staffUserId);
      const keys = await store.members(indexKey);
      // `C-093` reports how many live sessions the reset ended. The index may name a session that has
      // already lapsed, so the count is what the store actually removed rather than the index length.
      const ended = await store.delete(keys);
      await store.delete([indexKey]);
      return ended;
    },
  };
}

/** A token this adapter could have issued: unpadded base64url, long enough to be a secret. */
function isTokenShaped(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
