/**
 * The session and counter seam (`NFR-026`, `NFR-027`).
 *
 * Redis holds three things for identity: the session records, the one-time-code records, and the
 * counters that bound both. This seam names only the operations the adapters above it drive, with the
 * expiry rule baked into each one, so no adapter composes a raw command and no caller can write a key
 * that never expires.
 *
 * The values here are strings; the record shape belongs to the adapter that owns it
 * (`packages/platform/AGENTS.md` Structure).
 *
 * @module ports/session-store
 */

/** A session and counter store with mandatory expiry. */
export interface SessionStore {
  /** @returns The stored value, or `null` on a miss or an expired entry. */
  get(key: string): Promise<string | null>;

  /**
   * Store a value with an expiry.
   *
   * @param ttlSeconds - Positive, finite lifetime. A session or a code without one is refused.
   */
  set(key: string, value: string, ttlSeconds: number): Promise<void>;

  /** @returns How many of the given keys existed and were removed. */
  delete(keys: readonly string[]): Promise<number>;

  /**
   * Increment a counter and give it an expiry when it is created.
   *
   * The first increment starts the window; later ones do not extend it. Used for code attempts and
   * for rate-limit windows.
   *
   * @returns The counter after the increment.
   */
  increment(key: string, ttlSeconds: number): Promise<number>;

  /**
   * The remaining lifetime of a key.
   *
   * @returns Seconds remaining, `-1` for a key without an expiry, `-2` for a missing key.
   */
  ttl(key: string): Promise<number>;

  /**
   * Add one member to a set and set the set's expiry.
   *
   * Used for the staff session index, which is how every session of one staff user is found when the
   * credential is reset or the role changes (`C-092`).
   */
  addToSet(key: string, member: string, ttlSeconds: number): Promise<void>;

  /** The members of a set, empty when the set is absent. */
  members(key: string): Promise<readonly string[]>;

  /** @returns How many of the named members were present and removed. */
  removeFromSet(key: string, members: readonly string[]): Promise<number>;

  /** Whether the store answers. Used by readiness and by the boot check. */
  ping(): Promise<boolean>;
}

/** The session store could not be reached. The caller refuses the call rather than guessing. */
export class SessionStoreUnavailableError extends Error {
  constructor() {
    super('the session store is unavailable');
    this.name = 'SessionStoreUnavailableError';
  }
}
