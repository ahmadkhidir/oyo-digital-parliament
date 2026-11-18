/**
 * The staff session read (`C-092`, `NFR-026`).
 *
 * The admin shell asks this on every load: a signed-out staff caller is a state it renders, not an
 * error. The read answers the same staff projection `C-007` returns, with the enrolment flag added, and
 * it never returns a member object.
 */
import { identityFailure, type IdentityFailure, type StaffUser } from '../entities.ts';
import {
  isPast,
  staffNextScreen,
  staffProjection,
  toIsoSeconds,
  type StaffProjection,
} from '../policies.ts';
import type { IdentityPorts } from '../ports.ts';
import {
  clearedSessionCookie,
  liveSessionCookie,
  type SessionCookie,
} from '../../ports/session.ts';

/** The `C-092` session-read request. */
export interface ReadStaffSessionInput {
  readonly staffSessionToken?: string;
}

/** The signed-out answer. */
export interface StaffSignedOut {
  readonly ok: true;
  readonly signedIn: false;
  readonly staff: null;
  readonly session: null;
  readonly nextScreen: '/admin/sign-in';
  /** The clearing cookie a stale token earns, so the browser stops presenting it (`NFR-026`). */
  readonly cookie?: SessionCookie;
}

/** The signed-in answer, satisfied or not. */
export interface StaffSessionState {
  readonly ok: true;
  readonly signedIn: true;
  readonly staff: StaffProjection & { readonly secondFactorEnrolled: boolean };
  readonly session: {
    readonly expiresAt: string;
    readonly absoluteExpiresAt: string;
  };
  readonly nextScreen: '/admin' | '/admin/verify' | '/admin/enrol';
  /** The renewed cookie, so the browser's lifetime follows the sliding idle window (`NFR-026`). */
  readonly cookie?: SessionCookie;
}

/** The `C-092` answer, or the degraded refusal. */
export type ReadStaffSessionResult = StaffSignedOut | StaffSessionState | IdentityFailure;

/**
 * Reads the staff session the cookie names.
 *
 * @param deps - The staff session and staff user ports, and the clock.
 * @param input - The opaque cookie value, when one is present.
 */
export async function readStaffSession(
  deps: IdentityPorts,
  input: ReadStaffSessionInput,
): Promise<ReadStaffSessionResult> {
  const signedOut: StaffSignedOut = {
    ok: true,
    signedIn: false,
    staff: null,
    session: null,
    nextScreen: '/admin/sign-in',
  };

  if (input.staffSessionToken === undefined || input.staffSessionToken === '') {
    return signedOut;
  }

  const now = toIsoSeconds(deps.clock.now());
  let session;
  try {
    session = await deps.staffSessions.read(input.staffSessionToken);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'SESSION_STORE_UNAVAILABLE',
      'The session could not be read, so you are signed out.',
    );
  }
  if (
    session === null ||
    isPast(session.expiresAt, now) ||
    isPast(session.absoluteExpiresAt, now)
  ) {
    // `C-092`: a session past its idle or absolute timeout is signed out, and the cookie it arrived
    // in is cleared so the console does not keep presenting it.
    return { ...signedOut, cookie: clearedSessionCookie('staff') };
  }

  let staff: StaffUser | null;
  try {
    staff = await deps.staffUsers.get(session.staffId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'CREDENTIAL_STORE_UNAVAILABLE',
      'The staff account could not be read, so you are signed out.',
    );
  }
  if (staff === null || !staff.active) {
    return { ...signedOut, cookie: clearedSessionCookie('staff') };
  }

  const secondFactorEnrolled = staff.secondFactorEnrolled;
  const cookie = liveSessionCookie({
    namespace: 'staff',
    token: input.staffSessionToken,
    expiresAt: session.expiresAt,
    absoluteExpiresAt: session.absoluteExpiresAt,
    now,
  });
  return {
    ok: true,
    signedIn: true,
    staff: {
      ...staffProjection(staff, {
        secondFactorSatisfied: session.secondFactorSatisfied,
        includeEnrolment: true,
      }),
      secondFactorEnrolled,
    },
    session: {
      expiresAt: session.expiresAt,
      absoluteExpiresAt: session.absoluteExpiresAt,
    },
    nextScreen: staffNextScreen({
      secondFactorSatisfied: session.secondFactorSatisfied,
      secondFactorEnrolled,
    }),
    ...(cookie === null ? {} : { cookie }),
  };
}
