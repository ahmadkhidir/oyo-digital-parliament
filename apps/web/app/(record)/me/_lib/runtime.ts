/**
 * The My Record runtime seam (`C-032` to `C-036`, `FEAT-012`, `screens/13-my-record.md`).
 *
 * Builds, once per process, what the page, the layout, the actions and the two member route
 * handlers need: the identity platform, the member-session read and the ward reference. The
 * member-content and legal-hold ports are composed with the rest of the identity bundle in
 * `apps/web/lib/identity/ports.ts`; nothing here opens a database query, because a page composes
 * a port bundle and hands it to a domain use case (`apps/web/AGENTS.md` Discipline).
 *
 * The session read is the authority on who is asking. The proxy's redirect is a fast gate that
 * cannot reach the session store, so every read and every write here resolves the cookie again.
 */
import { createWardRepository } from '@odp/db';
import { readSession, type IdentityPorts, type SessionMemberProjection } from '@odp/domain';
import type { Platform } from '@odp/platform';
import { getMemberDependencies, type IdentityDependencies } from '../../../../lib/identity/ports';

/** The ward reference's narrow read: the name a member's recorded ward carries. */
type WardReference = ReturnType<typeof createWardRepository>;

/** Everything the member surface receives from the identity composition root. */
export interface MyRecordRuntime {
  readonly platform: Platform;
  readonly ports: IdentityPorts;
  readonly database: IdentityDependencies['database'];
  readonly wards: WardReference;
}

let cached: Promise<MyRecordRuntime> | null = null;

/**
 * The process-wide bundle.
 *
 * The platform and the database handle are the identity bundle's own objects, so this screen never
 * opens a second Redis or PostgreSQL client. A construction failure throws, which is the configured
 * boot behaviour: a missing service is a failed request, never a silently degraded provider.
 */
export function getMyRecordRuntime(): Promise<MyRecordRuntime> {
  cached ??= (async () => {
    const identity = await getMemberDependencies();
    return {
      platform: identity.platform,
      ports: identity.ports,
      database: identity.database,
      wards: createWardRepository(identity.database.db),
    };
  })();
  return cached;
}

/**
 * What the presented cookie names.
 *
 * `signed-out` covers both an absent cookie and a cookie whose session has ended, so the screen
 * shows its sign-in prompt rather than a half-filled record. `degraded` is the session store's
 * failure, which is an error state and never a signed-out verdict.
 */
export type MyRecordSession =
  | { readonly kind: 'member'; readonly token: string; readonly member: SessionMemberProjection }
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'degraded' };

/**
 * Resolves the member the screen acts for.
 *
 * @param token - The opaque `odp_session` value the request presented, if any.
 */
export async function resolveMyRecordSession(token: string | null): Promise<MyRecordSession> {
  if (token === null || token === '') return { kind: 'signed-out' };
  const { ports } = await getMyRecordRuntime();
  try {
    const result = await readSession(ports, { memberSessionToken: token });
    if (!result.ok) return { kind: 'degraded' };
    // A staff session never carries a member object, so it reaches the sign-in prompt: there is
    // no staff view of this record (`C-032` FORBIDDEN_ROLE is raised for the API caller below).
    if (!result.signedIn || result.member === null) return { kind: 'signed-out' };
    return { kind: 'member', token, member: result.member };
  } catch {
    return { kind: 'degraded' };
  }
}

/**
 * The recorded ward's name, or `null` when the member has no ward or the reference cannot answer.
 *
 * A reference that cannot answer leaves the account as unresolved-looking rather than failing the
 * whole page: the ward is a label beside the account, not the record itself.
 */
export async function readWardName(wardId: string | undefined): Promise<string | null> {
  if (wardId === undefined || wardId === '') return null;
  try {
    const { wards } = await getMyRecordRuntime();
    const ward = await wards.getById(wardId);
    return ward?.name ?? null;
  } catch {
    return null;
  }
}
