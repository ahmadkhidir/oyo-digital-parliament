/**
 * The identity invariants (`FEAT-001`, `FEAT-012`, `NFR-020`, `NFR-021`, `NFR-026`, `NFR-040`,
 * `C-002` to `C-008`, `C-032` to `C-036`, `C-092`).
 *
 * Everything here is a pure, total function: no I/O, no clock read, no mutation. The windows, the
 * attempt limits and the membership rules are written down once, so a registration, a sign-in and a
 * staff challenge cannot disagree about how long a code lives or which account a number resolves to.
 */
import {
  CONSENT_PURPOSE_VALUES,
  DATA_REQUEST_TYPE_VALUES,
  MEMBER_LOCALES,
  STAFF_ROLES,
  identityFailure,
  type ConsentPurpose,
  type DataRequestType,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFieldReason,
  type Locale,
  type MemberRecord,
  type MemberWardStatus,
  type StaffCredentialState,
  type StaffRole,
  type StaffUser,
  type VerificationMethod,
} from './entities.ts';

/** `schema.md` `Member.telephoneNumber` pattern. */
export const TELEPHONE_PATTERN = /^\+234[0-9]{10}$/;

/** `FEAT-001`: the eligible band, inclusive. */
export const AGE_BAND_MIN = 18;
export const AGE_BAND_MAX = 35;

/** Column widths from `schema.md`. */
export const FULL_NAME_MAX_LENGTH = 160;
export const DISPLAY_NAME_MAX_LENGTH = 60;
export const DATA_REQUEST_REASON_MAX_LENGTH = 1000;

/**
 * A pending registration lives 24 hours from creation; a resend never extends it (`C-002`, `C-004`).
 */
export const PENDING_REGISTRATION_TTL_SECONDS = 24 * 60 * 60;
/** The one-minute resend timer the `C-002` answer prints. */
export const CODE_RESEND_COOLDOWN_SECONDS = 60;
/** `C-001` and `C-003`: three wrong attempts, then a short cooldown. */
export const CODE_ATTEMPT_LIMIT = 3;
export const CODE_COOLDOWN_SECONDS = 60;
/** A sign-in challenge lasts ten minutes (`C-005`). */
export const SIGN_IN_CHALLENGE_TTL_SECONDS = 10 * 60;

/**
 * The member session window.
 *
 * `NFR-026` requires absolute and idle timeouts and fixes no number for members; `${C-003}`'s printed
 * answer puts sign-in at 09:16 and expiry at 21:16, so twelve hours is the absolute window here and
 * the session store enforces the idle rule within it. Recorded as an assumption in the task report.
 */
export const MEMBER_SESSION_TTL_SECONDS = 12 * 60 * 60;

/** `C-092`: the password step admits the factor screens for ten minutes, idle and absolute at once. */
export const STAFF_CHALLENGE_TTL_SECONDS = 10 * 60;
/** `C-092`: thirty minutes idle, renewed by every authorised request. */
export const STAFF_SESSION_IDLE_SECONDS = 30 * 60;
/** `C-092`: eight hours from the password step, never extended. */
export const STAFF_SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;
/** `C-092`: five failures in fifteen minutes lock the credential. */
export const STAFF_LOCK_ATTEMPT_LIMIT = 5;
export const STAFF_LOCK_WINDOW_SECONDS = 15 * 60;
export const STAFF_LOCK_SECONDS = 30 * 60;

/** `C-092`: six digits on a thirty-second step, verified with one step either side. */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_WINDOW_STEPS = 1;
/** The issuer named in the otpauth URI the enrolment answer prints (`C-092`). */
export const TOTP_ISSUER = 'Oyo Digital Parliament';
/** `C-092`: ten single-use recovery codes issued once at enrolment. */
export const RECOVERY_CODE_COUNT = 10;

/** `C-092`: the password length bounds. Argon2id at cost 12 is the adapter's obligation (`NFR-021`). */
export const STAFF_PASSWORD_MIN_LENGTH = 12;
export const STAFF_PASSWORD_MAX_LENGTH = 128;
/** `schema.md` `StaffCredential.username`. */
export const STAFF_USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;

/** `C-035`: seven days for access and correction, thirty for export and deletion. */
export const DATA_REQUEST_DUE_DAYS: Readonly<Record<DataRequestType, number>> = {
  access: 7,
  correction: 7,
  export: 30,
  deletion: 30,
};

/** `C-036`: the signed export URL is valid for five minutes. */
export const EXPORT_URL_TTL_SECONDS = 5 * 60;

/**
 * A value read from an untrusted payload, or the reason it could not be read.
 *
 * The shape is deliberately the same as the wards module's `FieldReading`: one field, one frozen
 * `C-001` reason token, so a use case can merge several readings into one `fields` map.
 */
export type Reading<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly field: string; readonly reason: IdentityFieldReason };

/** `C-001` timestamps are RFC 3339, UTC, second precision, suffix `Z`. */
export function toIsoSeconds(at: Date): string {
  return at.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Adds a whole number of seconds to an instant and renders it in `C-001` form. */
export function addSeconds(instant: string, seconds: number): string {
  return toIsoSeconds(new Date(Date.parse(instant) + seconds * 1000));
}

/** Adds whole days to an instant. */
export function addDays(instant: string, days: number): string {
  return addSeconds(instant, days * 24 * 60 * 60);
}

/** Whether an instant has passed at `now`. An absent instant is never expired. */
export function isPast(instant: string | undefined, now: string): boolean {
  return instant !== undefined && Date.parse(instant) <= Date.parse(now);
}

/** Whole seconds left before `instant`, never below zero. */
export function secondsUntil(instant: string, now: string): number {
  return Math.max(0, Math.ceil((Date.parse(instant) - Date.parse(now)) / 1000));
}

/**
 * Normalises a telephone number to E.164.
 *
 * A resident may type a leading zero, spaces, dashes or brackets, or the country code without the
 * plus; all of those mean one number and must resolve to one account (`screens/02-sign-in.md`).
 * A number that cannot be read as a Nigerian mobile number answers `null`, and the caller refuses it
 * against `TELEPHONE_PATTERN` rather than guessing.
 */
export function normaliseTelephone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/[^0-9+]/g, '');
  const bare = digits.startsWith('+') ? digits.slice(1) : digits;
  if (/^0[789][01][0-9]{8}$/.test(bare)) return `+234${bare.slice(1)}`;
  if (/^234[789][01][0-9]{8}$/.test(bare)) return `+${bare}`;
  if (/^[789][01][0-9]{8}$/.test(bare)) return `+234${bare}`;
  return null;
}

/** Reads a telephone number from a payload. */
export function readTelephone(raw: unknown): Reading<string> {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, field: 'telephoneNumber', reason: 'REQUIRED' };
  }
  const normalised = normaliseTelephone(raw);
  if (normalised === null || !TELEPHONE_PATTERN.test(normalised)) {
    return { ok: false, field: 'telephoneNumber', reason: 'PATTERN_MISMATCH' };
  }
  return { ok: true, value: normalised };
}

/** Reads a declared age against the 18 to 35 band (`FEAT-001`). */
export function readDeclaredAge(raw: unknown): Reading<number> {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, field: 'declaredAge', reason: 'REQUIRED' };
  }
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isInteger(value)) {
    return { ok: false, field: 'declaredAge', reason: 'OUT_OF_BAND' };
  }
  if (value < AGE_BAND_MIN || value > AGE_BAND_MAX) {
    return { ok: false, field: 'declaredAge', reason: 'OUT_OF_BAND' };
  }
  return { ok: true, value };
}

/** Whether an age sits inside the eligible band. Kept as its own predicate for a policy test. */
export function isEligibleAge(age: number): boolean {
  return Number.isInteger(age) && age >= AGE_BAND_MIN && age <= AGE_BAND_MAX;
}

/** Reads a real name: required, non-blank, within the column. Diacritics and hyphens are preserved. */
export function readFullName(raw: unknown): Reading<string> {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, field: 'fullName', reason: 'REQUIRED' };
  }
  const value = raw.trim();
  if (value.length > FULL_NAME_MAX_LENGTH) {
    return { ok: false, field: 'fullName', reason: 'TOO_LONG' };
  }
  return { ok: true, value };
}

/**
 * Reads a display name. Absent is allowed at registration and a name is then generated
 * (`FEAT-001`); a supplied name must be non-blank and within sixty characters.
 */
export function readDisplayName(raw: unknown, options: { required: boolean }): Reading<string> {
  if (raw === undefined || raw === null || raw === '') {
    return options.required
      ? { ok: false, field: 'displayName', reason: 'REQUIRED' }
      : { ok: true, value: '' };
  }
  if (typeof raw !== 'string') {
    return { ok: false, field: 'displayName', reason: 'PATTERN_MISMATCH' };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return options.required
      ? { ok: false, field: 'displayName', reason: 'REQUIRED' }
      : { ok: true, value: '' };
  }
  if (value.length > DISPLAY_NAME_MAX_LENGTH) {
    return { ok: false, field: 'displayName', reason: 'TOO_LONG' };
  }
  return { ok: true, value };
}

/** Reads a locale against the two launch locales. */
export function readLocale(raw: unknown): Reading<Locale> {
  if (raw === undefined || raw === null) {
    return { ok: false, field: 'locale', reason: 'REQUIRED' };
  }
  return typeof raw === 'string' && (MEMBER_LOCALES as readonly string[]).includes(raw)
    ? { ok: true, value: raw as Locale }
    : { ok: false, field: 'locale', reason: 'ENUM_MISMATCH' };
}

/** Reads an optional locale, falling back to English. */
export function readLocaleOrDefault(raw: unknown): Locale {
  const reading = readLocale(raw);
  return reading.ok ? reading.value : 'en-NG';
}

/** Reads a one-time code. A pasted code may carry spaces; the digits are what matter (`screens/04`). */
export function readCode(raw: unknown): Reading<string> {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, field: 'code', reason: 'REQUIRED' };
  }
  const value = raw.replace(/\s+/g, '');
  if (!/^[0-9]{6}$/.test(value)) {
    return { ok: false, field: 'code', reason: 'PATTERN_MISMATCH' };
  }
  return { ok: true, value };
}

/** Reads a staff username (`schema.md` `StaffCredential.username`). */
export function readUsername(raw: unknown): Reading<string> {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, field: 'username', reason: 'REQUIRED' };
  }
  // A username is trimmed and matched without regard to case; a password never is.
  const value = raw.trim().toLowerCase();
  if (!STAFF_USERNAME_PATTERN.test(value)) {
    return { ok: false, field: 'username', reason: 'PATTERN_MISMATCH' };
  }
  return { ok: true, value };
}

/** Reads a staff password. Length only: the value is never trimmed, echoed or logged (`C-092`). */
export function readPassword(raw: unknown): Reading<string> {
  if (typeof raw !== 'string' || raw.length === 0) {
    return { ok: false, field: 'password', reason: 'REQUIRED' };
  }
  if (raw.length < STAFF_PASSWORD_MIN_LENGTH) {
    return { ok: false, field: 'password', reason: 'TOO_SHORT' };
  }
  if (raw.length > STAFF_PASSWORD_MAX_LENGTH) {
    return { ok: false, field: 'password', reason: 'TOO_LONG' };
  }
  return { ok: true, value: raw };
}

/** Reads a consent purpose. */
export function readConsentPurpose(raw: unknown): Reading<ConsentPurpose> {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, field: 'purpose', reason: 'REQUIRED' };
  }
  return typeof raw === 'string' && (CONSENT_PURPOSE_VALUES as readonly string[]).includes(raw)
    ? { ok: true, value: raw as ConsentPurpose }
    : { ok: false, field: 'purpose', reason: 'ENUM_MISMATCH' };
}

/** Reads a data-request type. */
export function readDataRequestType(raw: unknown): Reading<DataRequestType> {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, field: 'type', reason: 'REQUIRED' };
  }
  return typeof raw === 'string' && (DATA_REQUEST_TYPE_VALUES as readonly string[]).includes(raw)
    ? { ok: true, value: raw as DataRequestType }
    : { ok: false, field: 'type', reason: 'ENUM_MISMATCH' };
}

/** Reads a boolean flag such as `granted` or `offline_replay`. */
export function readBoolean(raw: unknown, field: string): Reading<boolean> {
  if (raw === undefined || raw === null) {
    return { ok: false, field, reason: 'REQUIRED' };
  }
  return typeof raw === 'boolean'
    ? { ok: true, value: raw }
    : { ok: false, field, reason: 'PATTERN_MISMATCH' };
}

/** Reads the enrolment action: begin or confirm (`C-092`). */
export function readEnrolmentAction(raw: unknown): Reading<'begin' | 'confirm'> {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: false, field: 'action', reason: 'REQUIRED' };
  }
  return raw === 'begin' || raw === 'confirm'
    ? { ok: true, value: raw }
    : { ok: false, field: 'action', reason: 'ENUM_MISMATCH' };
}

/** Whether a value is one of the six staff roles. */
export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && (STAFF_ROLES as readonly string[]).includes(value);
}

/** Whether a value is one of the two member ward states. */
export function isMemberWardStatus(value: unknown): value is MemberWardStatus {
  return value === 'resolved' || value === 'unresolved';
}

/**
 * Deterministic two-digit disambiguator derived from an identifier.
 *
 * The display name is public, so it must never be derived from a real name beyond its first word and
 * must not need randomness to be unique (`packages/domain/AGENTS.md` Discipline). A checksum of the
 * pending registration's identifier is stable across a retry and carries nothing about the person.
 */
export function displayNameDisambiguator(seed: string): number {
  let sum = 0;
  for (const character of seed) {
    sum = (sum + (character.codePointAt(0) ?? 0)) % 97;
  }
  return (sum % 90) + 10;
}

/** The first word of a real name, which is all a generated display name may borrow. */
export function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first.length > 0 ? first : 'Resident';
}

/**
 * Generates the display name a member who supplied none receives (`FEAT-001`).
 *
 * The first name plus a two-digit number, capped at the column width; the caller retries with
 * {@link disambiguateDisplayName} when the result is already taken.
 */
export function generateDisplayName(fullName: string, seed: string): string {
  const candidate = `${firstNameOf(fullName)} ${displayNameDisambiguator(seed)}`;
  return candidate.slice(0, DISPLAY_NAME_MAX_LENGTH);
}

/** Appends another number until a taken display name becomes unique. */
export function disambiguateDisplayName(base: string, attempt: number): string {
  const trimmed = base.trim().length > 0 ? base.trim() : 'Resident';
  return `${trimmed} ${attempt}`.slice(0, DISPLAY_NAME_MAX_LENGTH);
}

/** The instant a pending registration is discarded, 24 hours after creation. */
export function pendingRegistrationExpiry(createdAt: string): string {
  return addSeconds(createdAt, PENDING_REGISTRATION_TTL_SECONDS);
}

/** The instant a new code may be requested after one was sent. */
export function resendAvailableAt(codeSentAt: string): string {
  return addSeconds(codeSentAt, CODE_RESEND_COOLDOWN_SECONDS);
}

/** Seconds still to wait before a resend; zero when the cooldown has lapsed. */
export function resendCooldownRemaining(codeSentAt: string | undefined, now: string): number {
  return codeSentAt === undefined ? 0 : secondsUntil(resendAvailableAt(codeSentAt), now);
}

/**
 * The result of one wrong code attempt.
 *
 * `C-003` fixes three attempts and then a short cooldown, and calls for the answer to state the
 * attempts remaining, so both numbers are derived here rather than in each use case.
 */
export function codeFailureOutcome(attemptsAfterFailure: number): {
  readonly cooldown: boolean;
  readonly attemptsRemaining: number;
} {
  return {
    cooldown: attemptsAfterFailure >= CODE_ATTEMPT_LIMIT,
    attemptsRemaining: Math.max(0, CODE_ATTEMPT_LIMIT - attemptsAfterFailure),
  };
}

/** The member session's absolute expiry. */
export function memberSessionExpiry(at: string): string {
  return addSeconds(at, MEMBER_SESSION_TTL_SECONDS);
}

/** The sign-in challenge's expiry (`C-005`). */
export function signInChallengeExpiry(at: string): string {
  return addSeconds(at, SIGN_IN_CHALLENGE_TTL_SECONDS);
}

/**
 * The window the password step opens (`C-092`).
 *
 * The challenge itself is ten minutes, idle and absolute at once, and that is what the printed
 * challenge answer shows. The staff session that follows is anchored to the same password-step
 * instant by {@link staffSessionWindow}.
 */
export function staffChallengeWindow(at: string): {
  readonly expiresAt: string;
  readonly absoluteExpiresAt: string;
} {
  const expiresAt = addSeconds(at, STAFF_CHALLENGE_TTL_SECONDS);
  return { expiresAt, absoluteExpiresAt: expiresAt };
}

/**
 * The window a satisfied staff session receives: thirty minutes idle from now, eight hours absolute
 * from the password step, never extended (`C-092`).
 */
export function staffSessionWindow(
  sessionStartedAt: string,
  at: string,
): { readonly expiresAt: string; readonly absoluteExpiresAt: string } {
  return {
    expiresAt: addSeconds(at, STAFF_SESSION_IDLE_SECONDS),
    absoluteExpiresAt: addSeconds(sessionStartedAt, STAFF_SESSION_ABSOLUTE_SECONDS),
  };
}

/** Whether a staff session is usable at `now`: neither the idle nor the absolute timeout has passed. */
export function isStaffSessionLive(
  session: { readonly expiresAt: string; readonly absoluteExpiresAt: string },
  now: string,
): boolean {
  return !isPast(session.expiresAt, now) && !isPast(session.absoluteExpiresAt, now);
}

/** Whether a credential is enrolled with a second factor. */
export function isSecondFactorEnrolled(credential: StaffCredentialState): boolean {
  return credential.secondFactorEnrolledAt !== undefined;
}

/** Whether a credential's lock is in force at `now`, and how long is left. */
export function staffLockState(
  credential: StaffCredentialState,
  now: string,
): { readonly locked: boolean; readonly retryAfterSeconds: number } {
  if (credential.lockedUntil === undefined || isPast(credential.lockedUntil, now)) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  return { locked: true, retryAfterSeconds: secondsUntil(credential.lockedUntil, now) };
}

/** Whether a staff account may sign in at all (`StaffUser.active`). */
export function isStaffSignInAllowed(staff: StaffUser): boolean {
  return staff.active;
}

/** Whether a staff session may reach an admin operation.
 *
 * `C-092` admits only the verification, the enrolment, the session read and the sign-out while the
 * second factor is unsatisfied; every `C-040` to `C-069` operation answers
 * `SECOND_FACTOR_REQUIRED`. This predicate is the one place that answer is decided.
 */
export function staffMayAct(session: {
  readonly secondFactorSatisfied: boolean;
  readonly secondFactorEnrolled: boolean;
}): boolean {
  return session.secondFactorSatisfied && session.secondFactorEnrolled;
}

/** The refusal an admin operation returns before its second factor is satisfied (`C-092`). */
export function secondFactorRequiredFailure(): IdentityFailure {
  return identityFailure(
    'UNAUTHENTICATED',
    'SECOND_FACTOR_REQUIRED',
    'Confirm your second factor before opening the console.',
    {},
    { meta: { recoveryPath: '/admin/verify' } },
  );
}

/**
 * The first check every admin operation runs.
 *
 * Returns the refusal `C-092` fixes, or `null` when the session may proceed. A caller that forgets this
 * is a caller that can be reached before the second factor, so the rule lives here rather than in each
 * entry.
 */
export function staffActionRefusal(session: {
  readonly secondFactorSatisfied: boolean;
  readonly secondFactorEnrolled: boolean;
}): IdentityFailure | null {
  return staffMayAct(session) ? null : secondFactorRequiredFailure();
}

/** The screen a staff session belongs on, from its two factor facts (`C-092`). */
export function staffNextScreen(session: {
  readonly secondFactorSatisfied: boolean;
  readonly secondFactorEnrolled: boolean;
}): '/admin' | '/admin/verify' | '/admin/enrol' {
  if (session.secondFactorSatisfied && session.secondFactorEnrolled) return '/admin';
  return session.secondFactorEnrolled ? '/admin/verify' : '/admin/enrol';
}

/** The instant a data request is due (`C-035`). */
export function dataRequestDueAt(type: DataRequestType, requestedAt: string): string {
  return addDays(requestedAt, DATA_REQUEST_DUE_DAYS[type]);
}

/** A recorded purpose a call may read personal data for (`C-070`). */
export type PersonalDataPurpose =
  'attribution' | 'member_data_request' | 'residence_review' | 'assisted_intake';

/**
 * Whether this caller may read a member's real name, telephone number or declared age (`C-070`).
 *
 * A member may read their own record for a data request; the operator works the request queue; a
 * response-staff member conducting a residence review, and a ward organiser recording intake, see the
 * name and number they are working with. A moderator, a legal reviewer and an external reviewer hold
 * no such permission, and an external reviewer receives neither the identifier nor the name
 * (`packages/domain/AGENTS.md` Discipline).
 */
export function mayReadMemberPersonalData(input: {
  readonly caller: IdentityCaller;
  readonly purpose: PersonalDataPurpose;
  readonly memberId: string;
}): boolean {
  const { caller, purpose, memberId } = input;
  if (caller.kind === 'member') {
    return purpose === 'member_data_request' && caller.memberId === memberId;
  }
  if (caller.kind !== 'staff') return false;
  switch (purpose) {
    case 'member_data_request':
      return caller.role === 'operator';
    case 'residence_review':
      return caller.role === 'response_staff';
    case 'assisted_intake':
      return caller.role === 'ward_organiser' || caller.role === 'response_staff';
    case 'attribution':
      // Publishing attributes a display name, not a real name, so no role reads personal data to do it.
      return false;
    default:
      return false;
  }
}

/** The delivery-delay band `EVT-003` reports, as a closed token set. */
export type DeliveryDelayBand = 'under_1m' | '1m_to_5m' | 'over_5m';

/** Bands the delay between the latest dispatch and the accepted code. */
export function deliveryDelayBand(
  codeSentAt: string | undefined,
  acceptedAt: string,
): DeliveryDelayBand {
  if (codeSentAt === undefined) return 'over_5m';
  const seconds = Math.max(0, (Date.parse(acceptedAt) - Date.parse(codeSentAt)) / 1000);
  if (seconds < 60) return 'under_1m';
  if (seconds < 5 * 60) return '1m_to_5m';
  return 'over_5m';
}

/** The public summary `C-003` returns when the account is created. */
export interface RegistrationMemberProjection {
  readonly id: string;
  readonly displayName: string;
  readonly identityState: 'registered';
  readonly verificationMethod: VerificationMethod;
  readonly wardStatus: MemberWardStatus;
  readonly locale: Locale;
  readonly createdAt: string;
}

/** Projects a freshly created member for the `C-003` answer. */
export function registrationProjection(member: MemberRecord): RegistrationMemberProjection {
  return {
    id: member.id,
    displayName: member.displayName,
    identityState: 'registered',
    verificationMethod: member.verificationMethod,
    wardStatus: member.wardStatus,
    locale: member.locale,
    createdAt: member.createdAt,
  };
}

/** The session member summary `C-006` returns. */
export interface SessionMemberProjection {
  readonly id: string;
  readonly displayName: string;
  readonly identityState: MemberRecord['identityState'];
  readonly wardStatus: MemberWardStatus;
  readonly wardId?: string;
  readonly locale: Locale;
}

/** Projects a member for the `C-006` answer and the `C-007` session read. */
export function sessionMemberProjection(member: MemberRecord): SessionMemberProjection {
  return {
    id: member.id,
    displayName: member.displayName,
    identityState: member.identityState,
    wardStatus: member.wardStatus,
    ...(member.wardId === undefined ? {} : { wardId: member.wardId }),
    locale: member.locale,
  };
}

/** The staff projection `C-007` and `C-092` share. */
export interface StaffProjection {
  readonly id: string;
  readonly fullName: string;
  readonly role: StaffRole;
  readonly external: boolean;
  readonly secondFactorSatisfied: boolean;
  readonly authorisedWardIds: readonly string[];
  readonly secondFactorEnrolled?: boolean;
}

/** Projects a staff user for a session read; the enrolment flag is added by `C-092`. */
export function staffProjection(
  staff: StaffUser,
  session: { readonly secondFactorSatisfied: boolean; readonly includeEnrolment?: boolean },
): StaffProjection {
  return {
    id: staff.id,
    fullName: staff.fullName,
    role: staff.role,
    external: staff.external,
    secondFactorSatisfied: session.secondFactorSatisfied,
    authorisedWardIds: staff.authorisedWardIds,
    ...(session.includeEnrolment === true
      ? { secondFactorEnrolled: staff.secondFactorEnrolled }
      : {}),
  };
}

/** Reads a page size against `C-001` pagination: default 20, maximum 50. */
export function readRecordPageLimit(raw: unknown): Reading<number> {
  if (raw === undefined || raw === null) return { ok: true, value: 20 };
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 50) {
    return { ok: false, field: 'limit', reason: 'OUT_OF_BAND' };
  }
  return { ok: true, value: raw };
}

/**
 * Reads the `Idempotency-Key` every state-changing call must carry (`C-001`).
 *
 * The key's form is the transport's business; the domain only requires that one arrived, because a
 * replay is impossible without it and `C-092` names that requirement explicitly.
 */
export function readIdempotencyKey(raw: unknown): Reading<string> {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { ok: false, field: 'Idempotency-Key', reason: 'REQUIRED' };
  }
  return { ok: true, value: raw.trim() };
}

/** Reads the path a signed-in member returns to. Only an internal path is accepted. */
export function readReturnTo(raw: unknown): Reading<string> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: '/' };
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//')) {
    return { ok: false, field: 'returnTo', reason: 'PATTERN_MISMATCH' };
  }
  return { ok: true, value: raw };
}
