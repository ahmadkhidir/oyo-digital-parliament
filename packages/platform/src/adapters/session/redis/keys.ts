/**
 * The session, code and limiter key scheme (`NFR-026`, `NFR-027`).
 *
 * Every key this capability writes is built here. Three rules make the scheme safe to read in a Redis
 * console or a slow query:
 *
 * - **No personal value appears in a key.** A telephone number and a source address are digested
 *   first; a session token is digested as well, so the key cannot be replayed as a cookie.
 * - **The scope is an opaque identifier or a fixed token**, never free text: a pending registration,
 *   a sign-in challenge or a staff user.
 * - **Every family says how long it lives** in the adapter that writes it. This module only names the
 *   key; it never returns one for an unknown scope, because a key built from an unchecked value is how
 *   a person's number ends up in Redis.
 *
 * Layout: `odp:v1:<family>:<scope>`.
 *
 * @module adapters/session/redis/keys
 */
import { createHash, createHmac } from 'node:crypto';

import { isIdentifier } from '../../../ids/ids.ts';

/** The namespace prefix. A version bump here retires every family at once. */
export const SESSION_NAMESPACE = 'odp:v1';

/** The two session namespaces, mirroring the cookie names. */
export type SessionKeyNamespace = 'member' | 'staff';

/** A bucket name: a lower-snake token a use case names, never free text. */
const BUCKET = /^[a-z][a-z0-9_]{1,39}$/;

/** A digest: 64 lower-case hexadecimal characters from SHA-256. */
const DIGEST = /^[0-9a-f]{64}$/;

/** The session record's key, derived from the token digest. */
export function sessionKey(namespace: SessionKeyNamespace, tokenDigest: string): string {
  if (!DIGEST.test(tokenDigest)) {
    throw new Error('a session key needs the SHA-256 digest of the token, never the token');
  }
  return `${SESSION_NAMESPACE}:sess:${namespace}:${tokenDigest}`;
}

/**
 * The set of session keys one staff user holds.
 *
 * `C-092` ends every session of a staff user on a role change, a deactivation and a credential reset,
 * and a set is the only way to find them without scanning the keyspace.
 */
export function staffSessionIndexKey(staffId: string): string {
  if (!/^stf_/.test(staffId) || !isIdentifier(staffId)) {
    throw new Error('a staff session index needs a staff identifier');
  }
  return `${SESSION_NAMESPACE}:sess:staff-index:${staffId}`;
}

/** The one-time-code record, keyed by the pending registration or sign-in challenge. */
export function verificationCodeKey(targetId: string): string {
  return identifierScoped('otp:code', targetId);
}

/** The wrong-attempt counter for one code. */
export function verificationAttemptsKey(targetId: string): string {
  return identifierScoped('otp:attempts', targetId);
}

/** The cooldown that follows the third wrong attempt. */
export function verificationCooldownKey(targetId: string): string {
  return identifierScoped('otp:cooldown', targetId);
}

/**
 * The counter for one limiter bucket, subject digest and fixed window.
 *
 * The window index is part of the key rather than an expiry on a shared counter, so a new window is a
 * new key and the old one ages out on its own. A counter can never be reset by a slow request.
 *
 * @param bucket - The bucket the caller named.
 * @param subjectDigest - {@link digestSubject}'s answer for the subject.
 * @param windowIndex - The fixed window's index, `floor(now / windowLength)`.
 */
export function rateLimitKey(bucket: string, subjectDigest: string, windowIndex: number): string {
  if (!BUCKET.test(bucket)) throw new Error('a rate-limit bucket is a lower-snake token');
  if (!DIGEST.test(subjectDigest)) {
    throw new Error('a rate-limit key needs the SHA-256 digest of the subject');
  }
  if (!Number.isSafeInteger(windowIndex) || windowIndex < 0) {
    throw new Error('a rate-limit window index must be a non-negative whole number');
  }
  return `${SESSION_NAMESPACE}:limit:${bucket}:${subjectDigest}:${windowIndex}`;
}

/**
 * The digest of an opaque session token.
 *
 * The token is random and long, so a plain digest is enough: the key is one-way, and the adapter
 * compares the digest rather than ever storing the token (`packages/platform/AGENTS.md` Discipline).
 */
export function digestSessionToken(token: string): string {
  return createHash('sha256').update(`odp:v1:token:${token}`, 'utf8').digest('hex');
}

/**
 * The digest of a rate-limit subject.
 *
 * The kind is part of the digested text, so the same identifier under two kinds produces two keys.
 * A keyed digest is used where a key is available; without one the value is still one-way, and a
 * telephone number is never written to Redis in the clear.
 *
 * @param subject.kind - The subject kind the caller named.
 * @param subject.value - The telephone number, address or identifier being counted.
 * @param key - An optional operator secret. When present the digest is an HMAC, so an enumerable
 *   subject space (Nigerian mobile numbers are) cannot be recovered by hashing candidates offline.
 */
export function digestSubject(
  subject: { readonly kind: string; readonly value: string },
  key?: string,
): string {
  if (!/^[a-z]{3,12}$/.test(subject.kind)) {
    throw new Error('a rate-limit subject needs a lower-case kind token');
  }
  if (subject.value === '') throw new Error('a rate-limit subject needs a value');
  const text = `odp:v1:subject:${subject.kind}:${subject.value}`;
  return key === undefined
    ? createHash('sha256').update(text, 'utf8').digest('hex')
    : createHmac('sha256', key).update(text, 'utf8').digest('hex');
}

/** Build a family key scoped by a record identifier, refusing anything else. */
function identifierScoped(family: string, targetId: string): string {
  if (!isIdentifier(targetId)) {
    throw new Error('a session store key needs a record identifier, never a personal value');
  }
  return `${SESSION_NAMESPACE}:${family}:${targetId}`;
}
