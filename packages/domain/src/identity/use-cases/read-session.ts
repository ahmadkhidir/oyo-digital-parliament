/**
 * The session read (`C-007`, `NFR-026`).
 *
 * Reports the caller's state from the two cookie namespaces. Signed out is a successful answer, not an
 * error, because every page has to render that state. A staff session never carries a member object,
 * and no privileged data is returned when a session cannot be read.
 */
import {
  identityFailure,
  type IdentityFailure,
  type Locale,
  type MemberRecord,
  type StaffUser,
} from '../entities.ts';
import {
  isPast,
  readLocaleOrDefault,
  sessionMemberProjection,
  staffProjection,
  toIsoSeconds,
  type SessionMemberProjection,
  type StaffProjection,
} from '../policies.ts';
import type { IdentityPorts, ResolvedMemberSession, ResolvedStaffSession } from '../ports.ts';
import {
  clearedSessionCookie,
  liveSessionCookie,
  type SessionCookie,
} from '../../ports/session.ts';

/** The `C-007` request: the two opaque cookie values the transport read, and a fallback locale. */
export interface ReadSessionInput {
  readonly memberSessionToken?: string;
  readonly staffSessionToken?: string;
  readonly locale?: Locale;
}

/** The signed-out answer. */
export interface SignedOutSession {
  readonly ok: true;
  readonly signedIn: false;
  readonly member: null;
  readonly staff: null;
  readonly locale: Locale;
  /** The clearing cookie a stale token earns, so the browser stops presenting it (`NFR-026`). */
  readonly cookie?: SessionCookie;
}

/** The member answer. */
export interface MemberSessionRead {
  readonly ok: true;
  readonly signedIn: true;
  readonly member: SessionMemberProjection;
  readonly staff: null;
  readonly locale: Locale;
  readonly session: { readonly expiresAt: string };
  /** The renewed cookie, so the browser's lifetime follows the sliding idle window (`NFR-026`). */
  readonly cookie?: SessionCookie;
}

/** The staff answer. */
export interface StaffSessionRead {
  readonly ok: true;
  readonly signedIn: true;
  readonly member: null;
  readonly staff: StaffProjection;
  readonly locale: Locale;
  readonly session: {
    readonly expiresAt: string;
    readonly absoluteExpiresAt: string;
  };
  /** The renewed cookie, so the browser's lifetime follows the sliding idle window (`NFR-026`). */
  readonly cookie?: SessionCookie;
}

/** The `C-007` answer, or the degraded refusal. */
export type ReadSessionResult =
  SignedOutSession | MemberSessionRead | StaffSessionRead | IdentityFailure;

/**
 * Reads whichever session the caller holds.
 *
 * @param deps - The two session ports and the member and staff stores.
 * @param input - The cookie values the transport resolved, and the visitor's locale.
 */
export async function readSession(
  deps: IdentityPorts,
  input: ReadSessionInput,
): Promise<ReadSessionResult> {
  const locale = readLocaleOrDefault(input.locale);
  const now = toIsoSeconds(deps.clock.now());

  if (input.memberSessionToken !== undefined && input.memberSessionToken !== '') {
    let session: ResolvedMemberSession | null;
    try {
      session = await deps.memberSessions.read(input.memberSessionToken);
    } catch {
      return identityFailure(
        'SERVICE_DEGRADED',
        'SESSION_STORE_UNAVAILABLE',
        'The session could not be read, so you are signed out.',
      );
    }
    if (
      session !== null &&
      !isPast(session.expiresAt, now) &&
      !isPast(session.absoluteExpiresAt, now)
    ) {
      let member: MemberRecord | null;
      try {
        member = await deps.members.get(session.memberId);
      } catch {
        return identityFailure(
          'SERVICE_DEGRADED',
          'IDENTITY_STORE_UNAVAILABLE',
          'The account could not be read, so you are signed out.',
        );
      }
      if (member !== null && member.deletedAt === undefined) {
        const cookie = liveSessionCookie({
          namespace: 'member',
          token: input.memberSessionToken,
          expiresAt: session.expiresAt,
          absoluteExpiresAt: session.absoluteExpiresAt,
          now,
        });
        return {
          ok: true,
          signedIn: true,
          member: sessionMemberProjection(member),
          staff: null,
          locale: member.locale,
          session: { expiresAt: session.expiresAt },
          ...(cookie === null ? {} : { cookie }),
        };
      }
    }
  }

  if (input.staffSessionToken !== undefined && input.staffSessionToken !== '') {
    let session: ResolvedStaffSession | null;
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
      session !== null &&
      !isPast(session.expiresAt, now) &&
      !isPast(session.absoluteExpiresAt, now)
    ) {
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
      if (staff !== null && staff.active) {
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
          member: null,
          staff: staffProjection(staff, {
            secondFactorSatisfied: session.secondFactorSatisfied,
          }),
          locale: staffLocale(),
          session: {
            expiresAt: session.expiresAt,
            absoluteExpiresAt: session.absoluteExpiresAt,
          },
          ...(cookie === null ? {} : { cookie }),
        };
      }
    }
  }

  // A token that names no live session is cleared rather than left in the browser: `C-007` answers
  // signed out, and the next request must not present the same dead token.
  const presented =
    input.memberSessionToken !== undefined && input.memberSessionToken !== ''
      ? 'member'
      : input.staffSessionToken !== undefined && input.staffSessionToken !== ''
        ? 'staff'
        : null;
  return {
    ok: true,
    signedIn: false,
    member: null,
    staff: null,
    locale,
    ...(presented === null ? {} : { cookie: clearedSessionCookie(presented) }),
  };
}

/**
 * A staff account has no locale column in `schema.md`; the staff console renders English until the
 * message catalogue gains a staff preference, which is a specification change rather than a guess.
 */
function staffLocale(): Locale {
  return 'en-NG';
}
