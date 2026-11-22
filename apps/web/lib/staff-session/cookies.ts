/**
 * The staff console's browser state (`C-092`, `NFR-026`, `NFR-024`).
 *
 * Three kinds of cookie live here and none of them authenticates a member surface:
 *
 * - `odp_staff_session` is the opaque staff session token. It is written only from the answer the
 *   domain built, never from a form value, with the attributes `C-092` fixes.
 * - `odp_staff_flow` carries one refusal or one notice across the redirect a server action answers
 *   with, so the screen renders the state its file declares without putting a cause token in a URL.
 *   It never carries a password, a code or a recovery code.
 * - `odp_staff_enrolment` and `odp_staff_recovery` carry the one-time enrolment material: the
 *   `otpauth` secret while the authenticator is being set up, and the recovery codes the confirming
 *   answer issued. Both are sealed with the platform's AES-256-GCM cipher before they reach a cookie,
 *   are `HttpOnly`, live ten minutes, and are cleared as soon as the page that shows them has been
 *   left (`NFR-024`).
 */
import { cookies } from 'next/headers';

/** The staff session cookie's name (`C-092`, `SESSION_COOKIE_NAMES.staff`). */
export const STAFF_SESSION_COOKIE = 'odp_staff_session';

/** One refusal's stable cause, as the sign-in and factor screens render them. */
export type StaffFlowCause =
  | 'VALIDATION'
  | 'STAFF_CREDENTIALS_INVALID'
  | 'ACCOUNT_LOCKED'
  | 'STAFF_INACTIVE'
  | 'STAFF_SIGN_IN_RATE_LIMITED'
  | 'SECOND_FACTOR_INCORRECT'
  | 'RECOVERY_CODE_UNKNOWN'
  | 'RECOVERY_CODE_SPENT'
  | 'SECOND_FACTOR_CHALLENGE_EXPIRED'
  | 'SECOND_FACTOR_INVALID'
  | 'SECOND_FACTOR_NOT_ENROLLED'
  | 'SECOND_FACTOR_ALREADY_ENROLLED'
  | 'STAFF_SESSION_REQUIRED'
  | 'DEGRADED'
  | 'WARD_RESOLUTION_INVALID'
  | 'WARD_REVIEW_NOT_FOUND'
  | 'WARD_DESCRIPTION_ALREADY_RESOLVED'
  | 'MEMBER_ACCOUNT_DELETED'
  | 'WARD_NOT_FOUND'
  | 'MEMBER_NOT_FOUND'
  | 'RESIDENCE_REVIEW_INVALID'
  | 'WARD_UNRESOLVED'
  | 'WARD_REVIEWER_REQUIRED'
  | 'DATA_REQUEST_RESOLUTION_INVALID'
  | 'DATA_REQUEST_NOT_FOUND'
  | 'DATA_REQUEST_ALREADY_CLOSED'
  | 'LEGAL_HOLD'
  | 'EXPORT_GENERATION_FAILED'
  | 'DATA_REQUEST_QUEUE_UNAVAILABLE'
  | 'MEMBER_SESSION_PRESENT';

/** One notice a screen states after a successful step. */
export type StaffFlowNotice =
  | 'RECOVERY_CODE_USED'
  | 'SESSION_ENDED'
  | 'PASSWORD_REQUIRED'
  | 'WARD_RESOLVED'
  | 'WARD_REJECTED'
  | 'RESIDENCE_CHECKED'
  | 'RESIDENCE_REJECTED'
  | 'REQUEST_STARTED'
  | 'REQUEST_COMPLETED'
  | 'REQUEST_DEFERRED'
  | 'REQUEST_REFUSED'
  | 'DELETION_COMPLETED';

/** The flow state one redirect carries. No secret is ever a field here. */
export interface StaffFlowState {
  readonly cause?: StaffFlowCause;
  readonly retryAfterSeconds?: number;
  readonly attemptsRemaining?: number;
  /** The staff username, kept so a refused attempt does not empty the field. */
  readonly username?: string;
  readonly lockedUntil?: string;
  readonly notice?: StaffFlowNotice;
  /** How many submissions a ward resolution moved, for its result sentence. */
  readonly moved?: number;
  /** How many submissions already carried a ward and were left alone. */
  readonly unchanged?: number;
}

/** The `otpauth` material shown once while an authenticator is enrolled. */
export interface EnrolmentState {
  readonly secret: string;
  readonly otpauthUri: string;
}

/** The recovery codes issued by a confirming enrolment, shown once. */
export interface IssuedRecoveryCodes {
  readonly codes: readonly string[];
}

const FLOW_COOKIE = 'odp_staff_flow';
const ENROLMENT_COOKIE = 'odp_staff_enrolment';
const RECOVERY_COOKIE = 'odp_staff_recovery';

/** Ten minutes: the challenge window, and long enough to finish one enrolment step. */
const FLOW_MAX_AGE_SECONDS = 600;

const COOKIE_ATTRIBUTES = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
} as const;

/** The answer a use case returns: the cookie the transport must set, header attributes included. */
interface SessionCookieAnswer {
  readonly name: string;
  readonly value: string;
  readonly header: string;
}

/** The `Max-Age` the domain's header states, or `undefined` when it states none. */
function maxAgeOf(header: string): number | undefined {
  const match = /Max-Age=([0-9]+)/.exec(header);
  if (match === null) return undefined;
  const seconds = Number(match[1]);
  return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

/** Sets a live staff session cookie from the domain's answer. */
export async function setStaffSessionCookie(cookie: SessionCookieAnswer): Promise<void> {
  const maxAge = maxAgeOf(cookie.header);
  if (maxAge === undefined) return;
  const store = await cookies();
  store.set(cookie.name, cookie.value, { ...COOKIE_ATTRIBUTES, maxAge });
}

/** Applies a session cookie answer verbatim, clearing answers included (`C-092`). */
export async function applyStaffSessionCookie(cookie: SessionCookieAnswer): Promise<void> {
  const match = /Max-Age=([0-9]+)/.exec(cookie.header);
  const seconds = match === null ? undefined : Number(match[1]);
  if (seconds === undefined || !Number.isSafeInteger(seconds) || seconds < 0) return;
  const store = await cookies();
  store.set(cookie.name, cookie.value, { ...COOKIE_ATTRIBUTES, maxAge: seconds });
}

/** Clears the staff session cookie with `Max-Age=0` (`C-092`). */
export async function clearStaffSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(STAFF_SESSION_COOKIE, '', { ...COOKIE_ATTRIBUTES, maxAge: 0 });
}

/** Whether the request presents a staff session token at all. */
export async function presentedStaffSessionToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(STAFF_SESSION_COOKIE)?.value;
  return value === undefined || value === '' ? null : value;
}

/** Encodes a JSON payload into a cookie-safe value. */
function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

/** Reads a cookie-safe JSON payload, or `null` when the value is not this module's own. */
function decode<T>(value: string | undefined): T | null {
  if (value === undefined || value === '') return null;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Writes the flow state one redirect carries. */
export async function writeStaffFlow(state: StaffFlowState): Promise<void> {
  const store = await cookies();
  store.set(FLOW_COOKIE, encode(state), { ...COOKIE_ATTRIBUTES, maxAge: FLOW_MAX_AGE_SECONDS });
}

/** Reads the flow state one redirect carried, or `null`. */
export async function readStaffFlow(): Promise<StaffFlowState | null> {
  const store = await cookies();
  return decode<StaffFlowState>(store.get(FLOW_COOKIE)?.value);
}

/** Clears the flow state without reading it. */
export async function clearStaffFlow(): Promise<void> {
  const store = await cookies();
  store.set(FLOW_COOKIE, '', { ...COOKIE_ATTRIBUTES, maxAge: 0 });
}

/** Writes the sealed enrolment material (`NFR-024`). */
export async function writeEnrolmentCookie(
  state: EnrolmentState,
  seal: (secret: string) => string,
): Promise<void> {
  const store = await cookies();
  store.set(ENROLMENT_COOKIE, seal(JSON.stringify(state)), {
    ...COOKIE_ATTRIBUTES,
    maxAge: FLOW_MAX_AGE_SECONDS,
  });
}

/** Reads the sealed enrolment material, or `null` when absent or unreadable. */
export async function readEnrolmentCookie(
  open: (sealed: string) => string,
): Promise<EnrolmentState | null> {
  const store = await cookies();
  const value = store.get(ENROLMENT_COOKIE)?.value;
  if (value === undefined || value === '') return null;
  try {
    return JSON.parse(open(value)) as EnrolmentState;
  } catch {
    return null;
  }
}

/** Clears the enrolment material. */
export async function clearEnrolmentCookie(): Promise<void> {
  const store = await cookies();
  store.set(ENROLMENT_COOKIE, '', { ...COOKIE_ATTRIBUTES, maxAge: 0 });
}

/** Writes the sealed recovery codes the confirming answer issued. */
export async function writeRecoveryCookie(
  state: IssuedRecoveryCodes,
  seal: (secret: string) => string,
): Promise<void> {
  const store = await cookies();
  store.set(RECOVERY_COOKIE, seal(JSON.stringify(state)), {
    ...COOKIE_ATTRIBUTES,
    maxAge: FLOW_MAX_AGE_SECONDS,
  });
}

/** Reads the sealed recovery codes, or `null` when they have been shown and cleared. */
export async function readRecoveryCookie(
  open: (sealed: string) => string,
): Promise<IssuedRecoveryCodes | null> {
  const store = await cookies();
  const value = store.get(RECOVERY_COOKIE)?.value;
  if (value === undefined || value === '') return null;
  try {
    return JSON.parse(open(value)) as IssuedRecoveryCodes;
  } catch {
    return null;
  }
}

/** Clears the recovery codes once the staff member has saved them. */
export async function clearRecoveryCookie(): Promise<void> {
  const store = await cookies();
  store.set(RECOVERY_COOKIE, '', { ...COOKIE_ATTRIBUTES, maxAge: 0 });
}
