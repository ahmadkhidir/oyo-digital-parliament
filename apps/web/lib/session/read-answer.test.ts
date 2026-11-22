/**
 * `GET /api/session` (`C-007`, `NFR-026`).
 *
 * The route is driven the way the browser drives it - through the real `readSession` use case over
 * the in-memory ports double, with the cookie jar and the composition root swapped per test - so the
 * three session states `C-007` names are proven end to end: a signed-in member, a signed-out
 * visitor, and a presented token whose session has ended. The staff answer and the degraded store
 * refusal are the two remaining outcomes the entry declares.
 *
 * The last test pins the contract's privacy line: the body carries the member projection and
 * nothing about the member's telephone number, full name or declared age.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { IdentityPorts, MemberRecord, StaffUser } from '@odp/domain';
import {
  DOUBLE_SESSION_TOKEN,
  FIXED_NOW,
  createPortsDouble,
  doubleMember,
  type PortsDouble,
} from '../../test/identity-double';

/** The cookie jar the handler reads and writes; reset per test. */
const jar = new Map<string, string>();

/** Every `Set-Cookie` the handler attempted, in order. */
const cookieWrites: { name: string; value: string; maxAge?: number }[] = [];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      jar.set(name, value);
      cookieWrites.push({
        name,
        value,
        ...(options?.maxAge === undefined ? {} : { maxAge: options.maxAge }),
      });
    },
  }),
  headers: async () => new Headers(),
}));

/** The ports the handler receives, swapped per test. */
const holder = vi.hoisted(() => ({ ports: null as IdentityPorts | null }));
vi.mock('./deps', () => ({
  getSignInDependencies: async () => holder.ports as IdentityPorts,
}));

import { GET } from '../../app/api/session/route';

/** The seeded member; `yo-NG` proves the member's own locale outranks the visitor's cookie. */
const MEMBER: MemberRecord = doubleMember({
  id: 'mbr_DOUBLE0000000000000000000002',
  displayName: 'Seeded M.',
  locale: 'yo-NG',
  wardStatus: 'resolved',
  wardId: 'wrd_DOUBLE00000000000000000001',
});

/** The seeded staff user `C-007` prints; the external reviewer holds no ward. */
const STAFF: StaffUser = {
  id: 'stf_DOUBLE0000000000000000000001',
  fullName: 'A. Balogun',
  role: 'external_reviewer',
  external: true,
  authorisedWardIds: [],
  secondFactorEnrolled: true,
  active: true,
  createdAt: FIXED_NOW,
};

/** A live window that ends after the double's fixed instant. */
const LIVE = {
  expiresAt: '2026-11-18T21:00:00Z',
  absoluteExpiresAt: '2026-11-19T09:00:00Z',
} as const;

/** The instant the domain's clock reports, and therefore `meta.asAt`. */
const AS_AT = FIXED_NOW;

/** The double with the member and staff stores the session read reaches. */
function portsFor(options: {
  readonly memberSessionLive?: boolean;
  readonly staffSessionLive?: boolean;
  readonly storeFails?: boolean;
}): IdentityPorts {
  const base: PortsDouble = createPortsDouble({ members: [MEMBER] });
  return {
    ...base.ports,
    members: {
      ...base.ports.members,
      get: async (id) => (id === MEMBER.id ? MEMBER : null),
    },
    memberSessions: {
      ...base.ports.memberSessions,
      read: async (token) => {
        if (options.storeFails === true) throw new Error('redis is unreachable');
        if (token !== DOUBLE_SESSION_TOKEN) return null;
        return {
          sessionId: DOUBLE_SESSION_TOKEN,
          memberId: MEMBER.id,
          lastSeenAt: FIXED_NOW,
          expiresAt: options.memberSessionLive === false ? '2026-11-18T08:00:00Z' : LIVE.expiresAt,
          absoluteExpiresAt: LIVE.absoluteExpiresAt,
        };
      },
    },
    staffSessions: {
      create: () => Promise.reject(new Error('not reached')),
      read: async (token) => {
        if (options.storeFails === true) throw new Error('redis is unreachable');
        if (token !== DOUBLE_SESSION_TOKEN) return null;
        return {
          sessionId: DOUBLE_SESSION_TOKEN,
          staffId: STAFF.id,
          secondFactorSatisfied: true,
          startedAt: FIXED_NOW,
          lastSeenAt: FIXED_NOW,
          expiresAt: options.staffSessionLive === false ? '2026-11-18T08:00:00Z' : LIVE.expiresAt,
          absoluteExpiresAt: LIVE.absoluteExpiresAt,
        };
      },
      upgrade: () => Promise.reject(new Error('not reached')),
      end: () => Promise.reject(new Error('not reached')),
      endAllForStaff: () => Promise.reject(new Error('not reached')),
    },
    staffUsers: {
      get: async (id) => (id === STAFF.id ? STAFF : null),
      setSecondFactorEnrolled: () => Promise.reject(new Error('not reached')),
    },
  };
}

/** Calls the handler for one request and returns its status and parsed body. */
async function readSessionRoute(headers: Record<string, string> = {}): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const response = await GET(new NextRequest('https://odp.test/api/session', { headers }));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  jar.clear();
  cookieWrites.length = 0;
  holder.ports = portsFor({});
});

describe('GET /api/session (C-007)', () => {
  it('answers a signed-out visitor with 200, both actors null, and the visitor locale', async () => {
    jar.set('odp_locale', 'yo-NG');

    const { status, body } = await readSessionRoute({ 'x-correlation-id': 'req_01J9Z6M2V4' });

    expect(status).toBe(200);
    expect(body).toEqual({
      data: { signedIn: false, member: null, staff: null, locale: 'yo-NG' },
      meta: { correlationId: 'req_01J9Z6M2V4', asAt: AS_AT, degraded: false },
    });
    // No token was presented, so there is nothing to clear.
    expect(cookieWrites).toEqual([]);
  });

  it('answers a signed-in member with the session body and renews the cookie', async () => {
    jar.set('odp_session', DOUBLE_SESSION_TOKEN);
    jar.set('odp_locale', 'en-NG');

    const { status, body } = await readSessionRoute({ 'x-correlation-id': 'req_01J9Z6M2V4' });

    expect(status).toBe(200);
    expect(body).toEqual({
      data: {
        signedIn: true,
        member: {
          id: MEMBER.id,
          displayName: MEMBER.displayName,
          identityState: 'registered',
          wardStatus: 'resolved',
          wardId: MEMBER.wardId,
          locale: 'yo-NG',
        },
        staff: null,
        locale: 'yo-NG',
        session: { expiresAt: LIVE.expiresAt },
      },
      meta: { correlationId: 'req_01J9Z6M2V4', asAt: AS_AT, degraded: false },
    });

    // The sliding window is renewed against the same cookie, with the contract's attributes.
    expect(cookieWrites).toHaveLength(1);
    expect(cookieWrites[0]).toMatchObject({
      name: 'odp_session',
      value: DOUBLE_SESSION_TOKEN,
      maxAge: 12 * 60 * 60,
    });
  });

  it('answers an ended session as signed out and clears the dead cookie', async () => {
    holder.ports = portsFor({ memberSessionLive: false });
    jar.set('odp_session', DOUBLE_SESSION_TOKEN);

    const { status, body } = await readSessionRoute({ 'x-correlation-id': 'req_01J9Z6M2V4' });

    expect(status).toBe(200);
    expect(body).toEqual({
      data: { signedIn: false, member: null, staff: null, locale: 'en-NG' },
      meta: { correlationId: 'req_01J9Z6M2V4', asAt: AS_AT, degraded: false },
    });
    expect(cookieWrites).toEqual([{ name: 'odp_session', value: '', maxAge: 0 }]);
  });

  it('answers a staff session with the staff projection and never a member object', async () => {
    jar.set('odp_staff_session', DOUBLE_SESSION_TOKEN);
    jar.set('odp_locale', 'yo-NG');

    const { status, body } = await readSessionRoute({ 'x-correlation-id': 'req_01J9Z6M2V4' });

    expect(status).toBe(200);
    expect(body).toEqual({
      data: {
        signedIn: true,
        member: null,
        staff: {
          id: STAFF.id,
          fullName: STAFF.fullName,
          role: 'external_reviewer',
          external: true,
          secondFactorSatisfied: true,
          authorisedWardIds: [],
        },
        locale: 'en-NG',
        session: { expiresAt: LIVE.expiresAt, absoluteExpiresAt: LIVE.absoluteExpiresAt },
      },
      meta: { correlationId: 'req_01J9Z6M2V4', asAt: AS_AT, degraded: false },
    });
    expect(JSON.stringify(body)).not.toContain(MEMBER.id);
  });

  it('answers SERVICE_DEGRADED with no privileged data when the session store is unreachable', async () => {
    holder.ports = portsFor({ storeFails: true });
    jar.set('odp_session', DOUBLE_SESSION_TOKEN);

    const { status, body } = await readSessionRoute({ 'x-correlation-id': 'req_01J9Z6M2V4' });

    expect(status).toBe(503);
    expect(body).toEqual({
      error: {
        code: 'SERVICE_DEGRADED',
        cause: 'SESSION_STORE_UNAVAILABLE',
        message: 'The session could not be read, so you are signed out.',
        correlationId: 'req_01J9Z6M2V4',
      },
    });
    expect(cookieWrites).toEqual([]);
  });

  it('carries no personal data beyond the contract in the member answer (NFR-040)', async () => {
    jar.set('odp_session', DOUBLE_SESSION_TOKEN);

    const { body } = await readSessionRoute({});
    const data = body.data as { member: Record<string, unknown> };

    expect(Object.keys(data.member).sort()).toEqual([
      'displayName',
      'id',
      'identityState',
      'locale',
      'wardId',
      'wardStatus',
    ]);
    const serialised = JSON.stringify(data.member);
    expect(serialised).not.toContain(MEMBER.telephoneNumber);
    expect(serialised).not.toContain(MEMBER.fullName);
    expect(data.member).not.toHaveProperty('declaredAge');
  });

  it('mints a correlation identifier when the caller supplied none', async () => {
    const { body } = await readSessionRoute();
    const meta = body.meta as { correlationId: string };

    expect(meta.correlationId).toMatch(/^req_[0-9A-Z]{4,32}$/);
  });
});
