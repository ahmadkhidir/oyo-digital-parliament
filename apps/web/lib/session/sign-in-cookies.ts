/**
 * The sign-in flow's short-lived cookies (`screens/02-sign-in.md` state table).
 *
 * The same pattern the join flow uses (`../identity/join-cookies`): a server action answers by
 * redirecting, and the next render cannot see the FormData, so the submitted values and the reason
 * a request failed travel in HttpOnly cookies that the redirected page reads once and the next
 * action clears. This is what keeps the no-scripting path working without putting personal data in
 * a URL or a cache key.
 *
 * Three cookies, each carrying the least it can:
 *
 * - `odp_signin_pending` — where this browser's sign-in stands: the challenge identifier, the
 *   number it was sent to, whether the member must choose between accounts, the `returnTo` path
 *   they came from and when a new code may be requested. The telephone number is the visitor's own
 *   typed input, held no longer than the flow, exactly as the join flow's retry cookie holds it.
 * - `odp_signin_retry` — the number a refused attempt submitted and why it was refused.
 * - `odp_signin_status` — one outcome token for the redirected render, with the counts the
 *   contracts carry (`C-006` `attemptsRemaining`, `C-005`/`C-006` `retryAfterSeconds`).
 *
 * All three are HttpOnly, SameSite=Lax, scoped to one visitor session, and expire in minutes. No
 * session cookie is written here: the session is the domain's answer and only an action applies it
 * (`C-006`, `NFR-026`).
 */
import { cookies } from 'next/headers';

/** The opaque identifier form `C-001` fixes; a cookie value outside it is treated as absent. */
const IDENTIFIER_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;

/** How long a retry or status payload stays readable. One render is all it needs. */
const RETRY_TTL_SECONDS = 600;

/**
 * How long the pending pointer outlives the challenge it names. The challenge runs for ten minutes
 * (`SIGN_IN_CHALLENGE_TTL_SECONDS`, `C-005`); the pointer holds a little longer so a render that
 * starts just before the challenge closes can still name the expired code, and the resend the
 * screen offers replaces it.
 */
const PENDING_TTL_SECONDS = 15 * 60;

const PENDING_COOKIE = 'odp_signin_pending';
const RETRY_COOKIE = 'odp_signin_retry';
const STATUS_COOKIE = 'odp_signin_status';

/** The number the visitor is signing in with, as they typed it. */
export interface SignInFormValues {
  readonly telephoneNumber: string;
}

/** The values are empty strings when absent, so a render never reads `undefined`. */
export function emptySignInFormValues(): SignInFormValues {
  return { telephoneNumber: '' };
}

/**
 * Why the last request was refused or what it did, at the grain the screen's states name.
 *
 * The tokens are the stable `C-005`/`C-006` cause tokens, plus the code field's own `C-001`
 * reasons, plus the two this flow introduces for its own transport facts: `DELIVERY_FAILED` (the
 * code could not be sent) and `SESSION_ENDED` (the screen's Expired-session state).
 */
export type SignInStatus =
  | 'REQUIRED'
  | 'PATTERN_MISMATCH'
  | 'CODE_INCORRECT'
  | 'CODE_ATTEMPTS_EXCEEDED'
  | 'CODE_EXPIRED'
  | 'CODE_ALREADY_USED'
  | 'ACCOUNT_CHOICE_REQUIRED'
  | 'DELIVERY_FAILED'
  | 'RATE_LIMITED'
  | 'DEGRADED';

/** One failed number attempt, as the redirected number-step render reads it. */
export interface SignInRetryState {
  readonly at: string;
  readonly values: SignInFormValues;
  /** Field path → `C-001` reason token; the page maps each pair to its sentence. */
  readonly fields: Readonly<Record<string, string>>;
  readonly status?: SignInStatus;
  readonly retryAfterSeconds?: number;
}

/** Where this browser's sign-in stands, and what the code step needs to render it. */
export interface SignInPendingState {
  readonly challengeId: string;
  /** The number the code was sent to, as the visitor typed it (normalised before the store). */
  readonly telephoneNumber: string;
  /** Whether more than one account shares the number, so the code step renders the choice. */
  readonly accountChoiceRequired: boolean;
  /** How many accounts share the number (`C-005` reveals the count, never the names). */
  readonly accountCount: number;
  /** The internal path the member came from, returned unchanged (`C-006`). */
  readonly returnTo: string;
  /** When a new code may be requested, from the `C-005` answer. */
  readonly resendAvailableAt?: string;
}

/** One outcome of the confirm or the resend, as the redirected render reads it. */
export interface SignInStatusState {
  readonly at: string;
  readonly cause: SignInStatus;
  readonly attemptsRemaining?: number;
  readonly retryAfterSeconds?: number;
}

/** The attributes every flow cookie carries. Not a session cookie: these are transport, not identity. */
const COOKIE_ATTRIBUTES = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: true,
} as const;

/** Whether an instant is inside the retry window; an old payload is ignored, never shown. */
function isFresh(at: string, nowMs: number): boolean {
  const parsed = Date.parse(at);
  return Number.isFinite(parsed) && nowMs - parsed < RETRY_TTL_SECONDS * 1000;
}

/** Reads and parses one flow cookie, or `null` when it is absent, stale or malformed. */
async function readFlowCookie<T>(
  name: string,
  isState: (value: unknown) => value is T,
): Promise<T | null> {
  const store = await cookies();
  const raw = store.get(name)?.value;
  if (raw === undefined || raw === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isState(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Sets one flow cookie. The value is a JSON string; the caller owns its shape. */
async function writeFlowCookie(
  name: string,
  value: unknown,
  maxAgeSeconds: number,
): Promise<void> {
  const store = await cookies();
  store.set(name, JSON.stringify(value), { ...COOKIE_ATTRIBUTES, maxAge: maxAgeSeconds });
}

async function clearFlowCookie(name: string): Promise<void> {
  const store = await cookies();
  store.set(name, '', { ...COOKIE_ATTRIBUTES, maxAge: 0 });
}

/** Whether a value is a fresh retry payload. */
function isSignInRetryState(value: unknown): value is SignInRetryState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<SignInRetryState>;
  return (
    typeof state.at === 'string' &&
    typeof state.values === 'object' &&
    state.values !== null &&
    typeof state.fields === 'object' &&
    state.fields !== null
  );
}

/** Whether a value is a pending sign-in pointer with identifiers the contract would print. */
function isSignInPendingState(value: unknown): value is SignInPendingState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<SignInPendingState>;
  return (
    typeof state.challengeId === 'string' &&
    IDENTIFIER_PATTERN.test(state.challengeId) &&
    typeof state.telephoneNumber === 'string' &&
    typeof state.accountChoiceRequired === 'boolean' &&
    typeof state.accountCount === 'number' &&
    Number.isSafeInteger(state.accountCount) &&
    state.accountCount >= 1 &&
    typeof state.returnTo === 'string' &&
    state.returnTo.startsWith('/') &&
    !state.returnTo.startsWith('//')
  );
}

/** Whether a value is a fresh sign-in status payload. */
function isSignInStatusState(value: unknown): value is SignInStatusState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<SignInStatusState>;
  return typeof state.at === 'string' && typeof state.cause === 'string';
}

/** Reads the pending sign-in pointer, ignoring a malformed or expired one. */
export async function readSignInPending(): Promise<SignInPendingState | null> {
  return readFlowCookie(PENDING_COOKIE, isSignInPendingState);
}

/** Records where this browser's sign-in stands. */
export async function writeSignInPending(pending: SignInPendingState): Promise<void> {
  await writeFlowCookie(PENDING_COOKIE, pending, PENDING_TTL_SECONDS);
}

/** Forgets the pointer: a completed sign-in, or a flow the visitor restarted. */
export async function clearSignInPending(): Promise<void> {
  await clearFlowCookie(PENDING_COOKIE);
}

/** Reads the failed-attempt payload for the redirected render. */
export async function readSignInRetry(): Promise<SignInRetryState | null> {
  const state = await readFlowCookie(RETRY_COOKIE, isSignInRetryState);
  if (state === null) return null;
  return isFresh(state.at, Date.now()) ? state : null;
}

/** Records a failed number attempt for the next render. */
export async function writeSignInRetry(state: Omit<SignInRetryState, 'at'>): Promise<void> {
  await writeFlowCookie(RETRY_COOKIE, { ...state, at: new Date().toISOString() }, RETRY_TTL_SECONDS);
}

/** Forgets the payload; a sent code must not leave an error behind. */
export async function clearSignInRetry(): Promise<void> {
  await clearFlowCookie(RETRY_COOKIE);
}

/** Reads the sign-in outcome for the redirected render. */
export async function readSignInStatus(): Promise<SignInStatusState | null> {
  const state = await readFlowCookie(STATUS_COOKIE, isSignInStatusState);
  if (state === null) return null;
  return isFresh(state.at, Date.now()) ? state : null;
}

/** Records one confirm or resend outcome for the next render. */
export async function writeSignInStatus(state: Omit<SignInStatusState, 'at'>): Promise<void> {
  await writeFlowCookie(STATUS_COOKIE, { ...state, at: new Date().toISOString() }, RETRY_TTL_SECONDS);
}

/** Forgets the outcome; the next render owns the screen's state. */
export async function clearSignInStatus(): Promise<void> {
  await clearFlowCookie(STATUS_COOKIE);
}
