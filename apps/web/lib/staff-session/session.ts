/**
 * Resolving the staff session for a console page, action or route handler (`C-092`, `NFR-026`).
 *
 * `readStaffSession` answers four things the shell must tell apart: a satisfied session, a challenge
 * that still owes its second factor, a signed-out caller, and a store that could not answer. The
 * screens declare a state for each, so this module keeps them distinct rather than flattening them
 * into one redirect.
 */
import {
  STAFF_SESSION_ABSOLUTE_SECONDS,
  readStaffSession,
  type IdentityCaller,
  type SessionCookie,
  type StaffSessionState,
} from '@odp/domain';
import type { LaunchLocale } from '../../messages';
import { newCorrelationId } from '../logging';
import { getStaffAdminDependencies } from './deps';
import { presentedStaffSessionToken } from './cookies';

/** The staff projection `C-092` returns. */
export type StaffSessionStaff = StaffSessionState['staff'];

/** A satisfied session: the only shape an admin screen may render. */
export interface ReadyStaffAccess {
  readonly kind: 'ready';
  readonly staff: StaffSessionStaff;
  readonly session: NonNullable<StaffSessionState['session']>;
  readonly token: string;
  /** The password step's instant, which the eight-hour absolute timeout runs from. */
  readonly startedAt: string;
  readonly cookie?: SessionCookie;
}

/** A password step that still owes its second factor. */
export interface ChallengeStaffAccess {
  readonly kind: 'challenge';
  readonly staff: StaffSessionStaff;
  readonly session: NonNullable<StaffSessionState['session']>;
  readonly token: string;
  /** The password step's instant, which the eight-hour absolute timeout runs from. */
  readonly startedAt: string;
  readonly cookie?: SessionCookie;
}

/** No live staff session. */
export interface SignedOutStaffAccess {
  readonly kind: 'signed_out';
  readonly cookie?: SessionCookie;
}

/** The session store did not answer. */
export interface DegradedStaffAccess {
  readonly kind: 'degraded';
  readonly cause: string;
}

/** Every answer the shell renders. */
export type StaffAccess =
  | ReadyStaffAccess
  | ChallengeStaffAccess
  | SignedOutStaffAccess
  | DegradedStaffAccess;

/** Reads the presented staff cookie and resolves it through the domain's session read. */
export async function readStaffAccess(): Promise<StaffAccess> {
  const dependencies = await getStaffAdminDependencies();
  const token = await presentedStaffSessionToken();
  const result = await readStaffSession(dependencies.identity, {
    ...(token === null ? {} : { staffSessionToken: token }),
  });

  if (!result.ok) {
    return { kind: 'degraded', cause: result.cause };
  }
  if (!result.signedIn || result.session === null) {
    return { kind: 'signed_out', ...(result.cookie === undefined ? {} : { cookie: result.cookie }) };
  }

  const access = {
    staff: result.staff,
    session: result.session,
    ...(result.cookie === undefined ? {} : { cookie: result.cookie }),
  };
  if (token === null) return { kind: 'signed_out' };

  // `C-092` anchors the eight-hour absolute window to the password step, and the session record is
  // the only place that instant lives; the projection above prints only the two ends. A store that
  // cannot answer the second read leaves the computed fallback in `staffCaller`.
  let startedAt: string | null = null;
  try {
    const session = await dependencies.identity.staffSessions.read(token);
    startedAt = session?.startedAt ?? null;
  } catch {
    startedAt = null;
  }
  const anchor =
    startedAt ??
    new Date(
      Date.parse(result.session.absoluteExpiresAt) - STAFF_SESSION_ABSOLUTE_SECONDS * 1000,
    )
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');

  if (result.staff.secondFactorSatisfied && result.staff.secondFactorEnrolled) {
    return { kind: 'ready', token, startedAt: anchor, ...access };
  }
  return { kind: 'challenge', token, startedAt: anchor, ...access };
}

/**
 * Builds the domain caller for one staff access.
 *
 * The password step's instant is the eight-hour absolute window counted back from its end, which is
 * exactly how the session adapter recorded it. Admin operations read only the identifier, role and
 * factor facts, but the shape stays complete so a later verification cannot be handed a hole.
 */
export function staffCaller(
  access: ReadyStaffAccess | ChallengeStaffAccess,
  locale: LaunchLocale,
  correlationId: string = newCorrelationId(),
): IdentityCaller {
  return {
    kind: 'staff',
    staffId: access.staff.id,
    role: access.staff.role,
    external: access.staff.external,
    authorisedWardIds: access.staff.authorisedWardIds,
    secondFactorSatisfied: access.staff.secondFactorSatisfied,
    secondFactorEnrolled: access.staff.secondFactorEnrolled,
    sessionId: access.token,
    sessionStartedAt: access.startedAt,
    sessionExpiresAt: access.session.expiresAt,
    locale,
    correlationId,
  };
}
