/**
 * The sign-in challenge store (`C-005`, `C-006`, `NFR-026`).
 *
 * The domain's `SignInChallengePort` had no adapter in the composition this slice inherited —
 * `apps/web/lib/identity/ports.ts` wires the port as "not wired yet" and names the sign-in task as
 * the one to compose it. This module is that composition: it satisfies the port over the platform's
 * Redis cache seam, which this deployable already opens (`packages/platform` `createPlatform`).
 *
 * Two properties the records must keep, whatever the store:
 *
 * - **Every key is opaque.** The record is keyed by the `sic_` challenge identifier; the attempt
 *   counter is keyed by a SHA-256 digest of the telephone number, never the number itself, for the
 *   same reason the rate limiter digests its subjects (`packages/platform/AGENTS.md` Discipline:
 *   no personal data in a key).
 * - **Every write carries an expiry.** A challenge outlives its `expiresAt` only if the store let
 *   it, so the TTL is computed from the instant the domain computed and never set wider.
 *
 * Store failures are never swallowed: the caller here is a domain use case that catches a throw and
 * answers `SERVICE_DEGRADED`, so an unreachable Redis must reach it as a throw, not as an empty
 * success.
 */
import {
  SIGN_IN_CHALLENGE_TTL_SECONDS,
  addSeconds,
  type SignInChallenge,
  type SignInChallengePort,
} from '@odp/domain';
import { createHash } from 'node:crypto';

/**
 * The part of the cache seam this store drives (`packages/platform` `CacheStore`, used here
 * structurally so this module never deep-imports the adapter package).
 */
interface ChallengeCache {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  increment(key: string, ttlSeconds: number): Promise<number>;
}

/** How long the per-number attempt counter stays warm; `EVT-002` reads the count it reports. */
const ATTEMPT_WINDOW_SECONDS = 60 * 60;

/** Key prefixes. Opaque identifiers and digests only — never a telephone number. */
const CHALLENGE_PREFIX = 'odp:signin:challenge:';
const CONSUMED_PREFIX = 'odp:signin:consumed:';
const ATTEMPTS_PREFIX = 'odp:signin:attempts:';

/** The shape stored under the challenge key; the id is already the key's suffix. */
interface StoredChallenge {
  readonly telephoneNumber: string;
  readonly memberIds: readonly string[];
  readonly codeSentAt: string;
  readonly expiresAt: string;
}

/** Whether a parsed value is a challenge record this store wrote. */
function isStoredChallenge(value: unknown): value is StoredChallenge {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<StoredChallenge>;
  return (
    typeof row.telephoneNumber === 'string' &&
    Array.isArray(row.memberIds) &&
    row.memberIds.every((id) => typeof id === 'string') &&
    typeof row.codeSentAt === 'string' &&
    typeof row.expiresAt === 'string'
  );
}

/** Whole seconds from `from` to `until`, floored at one so a write is never refused for its TTL. */
function ttlUntil(from: string, until: string): number {
  const seconds = Math.ceil((Date.parse(until) - Date.parse(from)) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 1;
}

/** The digest a counter key carries: the number is personal data and never reaches a key raw. */
function numberDigest(telephoneNumber: string): string {
  return createHash('sha256').update(telephoneNumber).digest('hex').slice(0, 32);
}

/**
 * Builds the challenge port over one cache seam.
 *
 * @param cache - The platform's cache store (Redis in production, the memory double in tests).
 */
export function createSignInChallengeStore(cache: ChallengeCache): SignInChallengePort {
  return {
    /** Creates the challenge and reports its attempt number for `EVT-002`. */
    async create(input): Promise<{ attempt: number }> {
      const attempt = await cache.increment(
        `${ATTEMPTS_PREFIX}${numberDigest(input.telephoneNumber)}`,
        ATTEMPT_WINDOW_SECONDS,
      );
      const record: StoredChallenge = {
        telephoneNumber: input.telephoneNumber,
        memberIds: [...input.memberIds],
        codeSentAt: input.at,
        expiresAt: input.expiresAt,
      };
      await cache.set(
        `${CHALLENGE_PREFIX}${input.id}`,
        JSON.stringify(record),
        ttlUntil(input.at, input.expiresAt),
      );
      return { attempt };
    },

    /** The challenge, or `null` when it is gone — expired or unknown alike (`C-006` `NOT_FOUND`). */
    async findById(challengeId): Promise<SignInChallenge | null> {
      const raw = await cache.get(`${CHALLENGE_PREFIX}${challengeId}`);
      if (raw === null) return null;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null; // A malformed record is a miss, not a crash: the caller re-requests a code.
      }
      if (!isStoredChallenge(parsed)) return null;
      return {
        id: challengeId,
        telephoneNumber: parsed.telephoneNumber,
        memberIds: parsed.memberIds,
        codeSentAt: parsed.codeSentAt,
        expiresAt: parsed.expiresAt,
      };
    },

    /**
     * Marks the challenge used.
     *
     * The deletion is the consumption: the cache seam's delete answers whether this caller was the
     * one that removed the key, so two concurrent codes cannot both open a session (`C-006`
     * `CONFLICT_ALREADY_DECIDED`). A short-lived marker keeps the "already used" refusal
     * distinguishable from "expired" until the challenge's window would have closed anyway.
     */
    async consume(challengeId, at): Promise<boolean> {
      const removed = await cache.delete(`${CHALLENGE_PREFIX}${challengeId}`);
      if (removed) {
        // The record carried the window; after the delete only the id is left, so the marker
        // inherits the challenge's own lifetime (`SIGN_IN_CHALLENGE_TTL_SECONDS`, `C-005`), counted
        // from the consumption instant the use case passed in.
        await cache.set(
          `${CONSUMED_PREFIX}${challengeId}`,
          '1',
          ttlUntil(at, addSeconds(at, SIGN_IN_CHALLENGE_TTL_SECONDS)),
        );
        return true;
      }
      return false;
    },
  };
}
