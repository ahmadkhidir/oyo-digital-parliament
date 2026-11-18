/**
 * The join flow's short-lived cookies (`screens/03-registration-form.md` and
 * `screens/04-number-confirmation.md` state tables).
 *
 * A server action runs inside one POST and answers by redirecting. The next render cannot see the
 * FormData, so the values a failed attempt submitted, and the reason it failed, travel in
 * HttpOnly cookies that the redirected page reads once and the next action clears. This is what
 * keeps the no-scripting path working (`apps/web/AGENTS.md` Discipline: a failed submission
 * re-renders with the submitted values still in the fields) without putting personal data in a
 * URL or in a server-side cache keyed by anything a person typed.
 *
 * Three cookies, each carrying the least it can:
 *
 * - `odp_join_pending` — the opaque PendingRegistration identifier and whether the first dispatch
 *   was held (`C-002` `codeDelivery.status:"delayed"`). This is the resident's place in the flow;
 *   it is how `/join/confirm` knows which record its code belongs to.
 * - `odp_join_retry` — the four submitted values and the field reasons of a failed registration,
 *   so the form can be shown again exactly as it was typed.
 * - `odp_join_status` — one outcome token for the confirmation screen, with the counts its
 *   sentences name (`C-003` `attemptsRemaining`, `C-003`/`C-004` `retryAfterSeconds`).
 *
 * All three are HttpOnly, SameSite=Lax, scoped to one visitor session, and expire in minutes. No
 * telephone number, name or age outlives the render it was held for.
 */
import { cookies } from 'next/headers';

/** The opaque identifier form `C-001` fixes; a cookie value outside it is treated as absent. */
const IDENTIFIER_PATTERN = /^[a-z]{3}_[0-9A-Z]{4,26}$/;

/** How long a retry or status payload stays readable. One render is all it needs. */
const RETRY_TTL_SECONDS = 600;

const PENDING_COOKIE = 'odp_join_pending';
const RETRY_COOKIE = 'odp_join_retry';
const STATUS_COOKIE = 'odp_join_status';

/** The four values the registration form holds, as the visitor typed them. */
export interface JoinFormValues {
  readonly fullName: string;
  readonly declaredAge: string;
  readonly telephoneNumber: string;
  readonly displayName: string;
}

/** The values are empty strings when absent, so a render never reads `undefined`. */
export function emptyJoinFormValues(): JoinFormValues {
  return { fullName: '', declaredAge: '', telephoneNumber: '', displayName: '' };
}

/** Why the registration was refused, at the grain the screen's states name. */
export type JoinStatus =
  'ALREADY_REGISTERED' | 'RATE_LIMITED' | 'DEGRADED' | 'REGISTRATION_EXPIRED';

/** One failed registration attempt, as the redirected `/join` render reads it. */
export interface JoinRetryState {
  readonly at: string;
  readonly values: JoinFormValues;
  /** Field path → `C-001` reason token; the page maps each pair to its sentence. */
  readonly fields: Readonly<Record<string, string>>;
  readonly status?: JoinStatus;
  readonly retryAfterSeconds?: number;
}

/** Where the confirmation screen's pending record lives, and whether its code is still owed. */
export interface JoinPendingState {
  readonly id: string;
  readonly delayed: boolean;
}

/** One outcome of the confirmation or the resend, as the redirected `/join/confirm` render reads it. */
export interface ConfirmStatusState {
  readonly at: string;
  /** A stable `C-003`/`C-004` cause token; the page maps it to its sentence. */
  readonly cause: string;
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
  maxAgeSeconds: number = RETRY_TTL_SECONDS,
): Promise<void> {
  const store = await cookies();
  store.set(name, JSON.stringify(value), { ...COOKIE_ATTRIBUTES, maxAge: maxAgeSeconds });
}

async function clearFlowCookie(name: string): Promise<void> {
  const store = await cookies();
  store.set(name, '', { ...COOKIE_ATTRIBUTES, maxAge: 0 });
}

/** Whether a value is a fresh retry payload. */
function isJoinRetryState(value: unknown): value is JoinRetryState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<JoinRetryState>;
  return (
    typeof state.at === 'string' &&
    typeof state.values === 'object' &&
    state.values !== null &&
    typeof state.fields === 'object' &&
    state.fields !== null
  );
}

/** Whether a value is a pending-registration pointer with an identifier the contract would print. */
function isJoinPendingState(value: unknown): value is JoinPendingState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<JoinPendingState>;
  return (
    typeof state.id === 'string' &&
    IDENTIFIER_PATTERN.test(state.id) &&
    typeof state.delayed === 'boolean'
  );
}

/** Whether a value is a fresh confirmation-status payload. */
function isConfirmStatusState(value: unknown): value is ConfirmStatusState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<ConfirmStatusState>;
  return typeof state.at === 'string' && typeof state.cause === 'string';
}

/** Reads the pending-registration pointer, ignoring a malformed or expired one. */
export async function readJoinPending(): Promise<JoinPendingState | null> {
  return readFlowCookie(PENDING_COOKIE, isJoinPendingState);
}

/** Records where this visitor's registration lives, and whether its code still needs sending. */
export async function writeJoinPending(pending: JoinPendingState): Promise<void> {
  // The pointer lives as long as the PendingRegistration itself: 24 hours (`C-002`).
  await writeFlowCookie(PENDING_COOKIE, pending, 24 * 60 * 60);
}

/** Forgets the pointer, on confirmation or when the record is known to be gone. */
export async function clearJoinPending(): Promise<void> {
  await clearFlowCookie(PENDING_COOKIE);
}

/** Reads the failed-registration payload for the redirected render. */
export async function readJoinRetry(): Promise<JoinRetryState | null> {
  const state = await readFlowCookie(RETRY_COOKIE, isJoinRetryState);
  if (state === null) return null;
  return isFresh(state.at, Date.now()) ? state : null;
}

/** Records a failed registration attempt for the next render. */
export async function writeJoinRetry(state: Omit<JoinRetryState, 'at'>): Promise<void> {
  await writeFlowCookie(RETRY_COOKIE, { ...state, at: new Date().toISOString() });
}

/** Forgets the payload; a successful send must not leave an error behind. */
export async function clearJoinRetry(): Promise<void> {
  await clearFlowCookie(RETRY_COOKIE);
}

/** Reads the confirmation outcome for the redirected render. */
export async function readConfirmStatus(): Promise<ConfirmStatusState | null> {
  const state = await readFlowCookie(STATUS_COOKIE, isConfirmStatusState);
  if (state === null) return null;
  return isFresh(state.at, Date.now()) ? state : null;
}

/** Records one confirmation or resend outcome for the next render. */
export async function writeConfirmStatus(state: Omit<ConfirmStatusState, 'at'>): Promise<void> {
  await writeFlowCookie(STATUS_COOKIE, { ...state, at: new Date().toISOString() });
}

/** Forgets the outcome; the next render owns the screen's state. */
export async function clearConfirmStatus(): Promise<void> {
  await clearFlowCookie(STATUS_COOKIE);
}
