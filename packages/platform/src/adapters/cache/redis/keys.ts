/**
 * The cache key scheme and its generations (`NFR-001`, `C-075`, `C-086`).
 *
 * Every key is built here. A caller never composes a key, because a key assembled at a call site is
 * how a telephone number or a search phrase ends up in Redis, and how two readers of the same page
 * end up with two different keys.
 *
 * The scheme is `odp:v1:<family>:<scope>:v<generation>:<variant>`:
 *
 * - `family` is one of the five read families;
 * - `scope` is an opaque identifier or a fixed token (`global`, a quarter, a month, a public
 *   reference) — never a person, a name or free text;
 * - `generation` is a counter bumped by invalidation, so a publication makes every older copy
 *   unreachable in one write while the old entries expire on their own;
 * - `variant` is a fixed-vocabulary token (a route and locale, a state filter) that distinguishes
 *   pages within one scope. A search query is hashed before it reaches this function.
 *
 * @module adapters/cache/redis/keys
 */
import { isIdentifier } from '../../../ids/ids.ts';
import type { CacheFamily } from '../../../../../domain/src/ports/cache.ts';

/** The namespace prefix. A version bump here invalidates every family at once. */
export const NAMESPACE = 'odp:v1';

/** A scope that is not tied to one record. */
export const GLOBAL_SCOPE = 'global';

/** The longest-lived cache key is the generation counter, refreshed on every invalidation. */
export const GENERATION_TTL_SECONDS = 60 * 60 * 24 * 30;

/** The scopes a key may name: a record identifier, a quarter, a month or a public reference. */
const SCOPE = /^(global|[a-z]{3}_[0-9A-Z]{4,26}|[0-9]{4}-Q[1-4]|[0-9]{4}-[0-9]{2}|ODP-[0-9]{6})$/;

/** A variant token: lower-case route, locale and filter vocabulary. */
const VARIANT = /^[a-z0-9~_-]{1,120}$/;

/** What identifies one cached copy. */
export interface CacheKeyInput {
  readonly family: CacheFamily;
  /** `global`, a record identifier, a quarter or a month. */
  readonly scope: string;
  /** The generation the copy belongs to. Read it with {@link generationKey} first. */
  readonly generation: number;
  /** The fixed-vocabulary variant within the scope. */
  readonly variant: string;
}

/** The key for one generation counter. */
export function generationKey(family: CacheFamily, scope: string): string {
  if (!SCOPE.test(scope))
    throw new Error('cache scope must be an opaque identifier or fixed token');
  return `${NAMESPACE}:generation:${family}:${scope}`;
}

/**
 * Build one cache key.
 *
 * @throws when the scope or variant is not in the fixed vocabulary; a caller cannot smuggle free
 *   text into Redis.
 */
export function cacheKey(input: CacheKeyInput): string {
  if (!SCOPE.test(input.scope)) {
    throw new Error('cache scope must be an opaque identifier or fixed token');
  }
  if (!VARIANT.test(input.variant)) {
    throw new Error('cache variant must be a lower-case fixed token');
  }
  if (!Number.isSafeInteger(input.generation) || input.generation < 0) {
    throw new Error('cache generation must be a non-negative whole number');
  }
  return `${NAMESPACE}:${input.family}:${input.scope}:v${input.generation}:${input.variant}`;
}

/**
 * A page variant token: the route key and the locale, which are both fixed vocabulary.
 *
 * @param route - A route key such as `record-home` or `submission-detail`.
 * @param locale - `en-NG` or `yo-NG`, from `Member.locale`.
 */
export function pageVariant(route: string, locale: 'en-NG' | 'yo-NG'): string {
  if (!/^[a-z0-9-]{1,60}$/.test(route)) throw new Error('route must be a lower-case route key');
  return `${route}~${locale.toLowerCase()}`;
}

/** A hash-shaped search token: 64 lower-case hexadecimal characters from a keyed digest. */
export function requireQueryHash(hash: string): string {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error('a search key needs a full SHA-256 hex digest, never the query text');
  }
  return hash;
}

/** Re-exported so a caller can validate an identifier-shaped scope without importing the factory. */
export { isIdentifier };
