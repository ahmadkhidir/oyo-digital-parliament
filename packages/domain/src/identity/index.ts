/**
 * The identity module (`FEAT-001`, `FEAT-012`): registration and the two identity tiers, the two
 * session namespaces, the member's own record and data rights, and staff authentication.
 *
 * The module owns the rules that decide who a person is on this platform, which account is acting, and
 * what may be read about them. It never produces a member register by ward or by any other grouping,
 * never lets a number hold two accounts, and never lets model output stand in for a person's choice
 * (`packages/domain/AGENTS.md` Discipline).
 */
export {
  CONSENT_PURPOSE_VALUES,
  DATA_REQUEST_STATUS_VALUES,
  DATA_REQUEST_TYPE_VALUES,
  MEMBER_IDENTITY_STATES,
  MEMBER_LOCALES,
  MEMBER_VERIFICATION_METHODS,
  MEMBER_WARD_STATUSES,
  STAFF_ROLES,
  identityFailure,
  type Consent,
  type ConsentPurpose,
  type DataRequest,
  type DataRequestStatus,
  type DataRequestType,
  type IdentityCaller,
  type IdentityFailure,
  type IdentityFailureCode,
  type IdentityFailureMeta,
  type IdentityFieldReason,
  type Locale,
  type MemberIdentityState,
  type MemberRecord,
  type MemberWardStatus,
  type PendingRegistration,
  type SignInChallenge,
  type StaffCredentialState,
  type StaffRole,
  type StaffUser,
  type VerificationMethod,
} from './entities.ts';

export {
  AGE_BAND_MAX,
  AGE_BAND_MIN,
  CODE_ATTEMPT_LIMIT,
  CODE_COOLDOWN_SECONDS,
  CODE_RESEND_COOLDOWN_SECONDS,
  DATA_REQUEST_DUE_DAYS,
  DATA_REQUEST_REASON_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  EXPORT_URL_TTL_SECONDS,
  FULL_NAME_MAX_LENGTH,
  MEMBER_SESSION_TTL_SECONDS,
  PENDING_REGISTRATION_TTL_SECONDS,
  RECOVERY_CODE_COUNT,
  SIGN_IN_CHALLENGE_TTL_SECONDS,
  STAFF_CHALLENGE_TTL_SECONDS,
  STAFF_LOCK_ATTEMPT_LIMIT,
  STAFF_LOCK_SECONDS,
  STAFF_LOCK_WINDOW_SECONDS,
  STAFF_PASSWORD_MAX_LENGTH,
  STAFF_PASSWORD_MIN_LENGTH,
  STAFF_SESSION_ABSOLUTE_SECONDS,
  STAFF_SESSION_IDLE_SECONDS,
  STAFF_USERNAME_PATTERN,
  TELEPHONE_PATTERN,
  TOTP_DIGITS,
  TOTP_ISSUER,
  TOTP_PERIOD_SECONDS,
  TOTP_WINDOW_STEPS,
  addDays,
  addSeconds,
  codeFailureOutcome,
  dataRequestDueAt,
  deliveryDelayBand,
  disambiguateDisplayName,
  displayNameDisambiguator,
  firstNameOf,
  generateDisplayName,
  isEligibleAge,
  isMemberWardStatus,
  isPast,
  isSecondFactorEnrolled,
  isStaffRole,
  isStaffSessionLive,
  mayReadMemberPersonalData,
  memberSessionExpiry,
  normaliseTelephone,
  pendingRegistrationExpiry,
  readBoolean,
  readCode,
  readConsentPurpose,
  readDataRequestType,
  readDeclaredAge,
  readDisplayName,
  readEnrolmentAction,
  readFullName,
  readIdempotencyKey,
  readLocale,
  readLocaleOrDefault,
  readRecordPageLimit,
  readPassword,
  readReturnTo,
  readTelephone,
  readUsername,
  registrationProjection,
  resendAvailableAt,
  resendCooldownRemaining,
  secondFactorRequiredFailure,
  secondsUntil,
  sessionMemberProjection,
  signInChallengeExpiry,
  staffActionRefusal,
  staffChallengeWindow,
  staffLockState,
  staffMayAct,
  staffNextScreen,
  staffProjection,
  staffSessionWindow,
  toIsoSeconds,
  type DeliveryDelayBand,
  type PersonalDataPurpose,
  type Reading,
  type RegistrationMemberProjection,
  type SessionMemberProjection,
  type StaffProjection,
} from './policies.ts';

export type {
  AnalyticsDeletionPort,
  CodeAttempts,
  CodeDelivery,
  ConsentPort,
  DataRequestPort,
  DataRequestQueuePort,
  DataRequestResolutionPort,
  DataRequestTransitionInput,
  HeldBackingRow,
  HeldItemRow,
  IdentityAnalyticsEvent,
  IdentityAnalyticsPort,
  IdentityPorts,
  IdempotencyPort,
  LegalHoldPort,
  MemberContentPort,
  MemberExportPort,
  MemberPort,
  MemberSessionPort,
  MemberSubmissionRow,
  PendingRegistrationPort,
  QueuedWritePort,
  RateLimitPort,
  RateLimitSubject,
  RecordedAnswer,
  ResolvedMemberSession,
  ResolvedStaffSession,
  SignInChallengePort,
  StaffCredentialPort,
  StaffSessionPort,
  StaffUserPort,
  TotpEnrolment,
  VerificationCodePort,
} from './ports.ts';

export {
  registerResident,
  type RegisterResidentInput,
  type RegisterResidentResult,
} from './use-cases/register-resident.ts';
export {
  confirmRegistration,
  type ConfirmRegistrationInput,
  type ConfirmRegistrationResult,
} from './use-cases/confirm-registration.ts';
export {
  resendRegistrationCode,
  type ResendRegistrationCodeInput,
  type ResendRegistrationCodeResult,
} from './use-cases/resend-registration-code.ts';
export {
  requestSignInCode,
  type RequestSignInCodeInput,
  type RequestSignInCodeResult,
} from './use-cases/request-sign-in-code.ts';
export {
  completeSignIn,
  type CompleteSignInInput,
  type CompleteSignInResult,
} from './use-cases/complete-sign-in.ts';
export {
  readSession,
  type MemberSessionRead,
  type ReadSessionInput,
  type ReadSessionResult,
  type SignedOutSession,
  type StaffSessionRead,
} from './use-cases/read-session.ts';
export { signOut, type SignOutInput, type SignOutResult } from './use-cases/sign-out.ts';
export {
  readMyRecord,
  type MyRecord,
  type MyRecordBacking,
  type MyRecordConsent,
  type MyRecordDataRequest,
  type MyRecordHeldItem,
  type MyRecordSubmission,
  type ReadMyRecordInput,
  type ReadMyRecordResult,
} from './use-cases/read-my-record.ts';
export {
  correctMyDetails,
  type CorrectMyDetailsInput,
  type CorrectMyDetailsResult,
} from './use-cases/correct-my-details.ts';
export {
  updateConsent,
  type UpdateConsentInput,
  type UpdateConsentResult,
} from './use-cases/update-consent.ts';
export {
  createDataRequest,
  type CreateDataRequestInput,
  type CreateDataRequestResult,
  type DataRequestCreated,
  type DataRequestQueued,
} from './use-cases/create-data-request.ts';
export {
  downloadExport,
  type DownloadExportInput,
  type DownloadExportResult,
} from './use-cases/download-export.ts';
export {
  anonymiseMember,
  type AnonymiseMemberInput,
  type AnonymiseMemberResult,
} from './use-cases/anonymise-member.ts';
export {
  beginStaffSignIn,
  type BeginStaffSignInInput,
  type BeginStaffSignInResult,
  type StaffChallengeOpened,
} from './use-cases/begin-staff-sign-in.ts';
export {
  verifyStaffSecondFactor,
  type StaffSignedIn,
  type VerifyStaffSecondFactorInput,
  type VerifyStaffSecondFactorResult,
} from './use-cases/verify-staff-second-factor.ts';
export {
  enrolStaffSecondFactor,
  type EnrolmentBegun,
  type EnrolmentComplete,
  type EnrolStaffSecondFactorInput,
  type EnrolStaffSecondFactorResult,
} from './use-cases/enrol-staff-second-factor.ts';
export {
  readStaffSession,
  type ReadStaffSessionInput,
  type ReadStaffSessionResult,
  type StaffSessionState,
  type StaffSignedOut,
} from './use-cases/read-staff-session.ts';
export {
  signOutStaff,
  type SignOutStaffInput,
  type SignOutStaffResult,
} from './use-cases/sign-out-staff.ts';
export {
  readDataRequestQueue,
  type DataRequestQueueDeps,
  type QueuedDataRequest,
  type ReadDataRequestQueueInput,
  type ReadDataRequestQueueResult,
} from './use-cases/read-data-request-queue.ts';
export {
  DATA_REQUEST_ACTIONS,
  resolveDataRequest,
  type DataRequestAction,
  type DataRequestPropagation,
  type ResolvedDataRequest,
  type ResolveDataRequestDeps,
  type ResolveDataRequestInput,
  type ResolveDataRequestResult,
} from './use-cases/resolve-data-request.ts';
