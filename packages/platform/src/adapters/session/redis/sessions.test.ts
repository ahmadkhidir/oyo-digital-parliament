/**
 * The member and staff session stores (`NFR-026`, `C-003`, `C-006` to `C-008`, `C-092`).
 *
 * The suite proves the properties the contracts state: the cookie value is opaque and stored only as
 * a digest, the idle window renews and stops at the absolute wall, ending a session removes it, and a
 * staff reset removes every session of that user. It runs against an in-memory store so an expiry is
 * a clock movement rather than a sleep.
 */
import { describe, expect, it } from 'vitest';

import { SessionStoreUnavailableError, type SessionStore } from '../../../ports/session-store.ts';
import { createFixedClock, type FixedClock } from '../../../testing/fixed-clock.ts';
import { createMemorySessionStore } from './memory-session-store.ts';
import {
  SessionNotFoundError,
  createMemberSessionStore,
  createStaffSessionStore,
} from './sessions.ts';

const MEMBER_ID = 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA';
const STAFF_ID = 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP';

function iso(clock: FixedClock, offsetSeconds = 0): string {
  return new Date(clock.now().getTime() + offsetSeconds * 1000).toISOString();
}

function harness(idleSeconds = 60 * 60) {
  const clock = createFixedClock('2026-11-18T09:00:00Z');
  const memory = createMemorySessionStore(clock);
  return {
    clock,
    memory,
    member: createMemberSessionStore({ store: memory, clock, idleSeconds }),
    staff: createStaffSessionStore({ store: memory, clock, idleSeconds: 30 * 60 }),
  };
}

describe('member sessions', () => {
  it('stores only a digest and returns an opaque token that is not the member id', async () => {
    const { memory, member, clock } = harness();

    const { sessionId } = await member.create({
      memberId: MEMBER_ID,
      at: iso(clock),
      expiresAt: iso(clock, 12 * 60 * 60),
      absoluteExpiresAt: iso(clock, 12 * 60 * 60),
    });

    expect(sessionId).not.toContain(MEMBER_ID);
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const key of memory.keys()) {
      expect(key).not.toContain(MEMBER_ID);
      expect(key).not.toContain(sessionId);
    }
    for (const key of memory.keys()) {
      expect(memory.raw(key) ?? '').not.toContain(sessionId);
    }
  });

  it('resolves the cookie value back to the member session', async () => {
    const { member, clock } = harness(12 * 60 * 60);
    const expiresAt = iso(clock, 12 * 60 * 60);
    const { sessionId } = await member.create({
      memberId: MEMBER_ID,
      at: iso(clock),
      expiresAt,
      absoluteExpiresAt: expiresAt,
    });

    const resolved = await member.read(sessionId);

    expect(resolved?.memberId).toBe(MEMBER_ID);
    expect(resolved?.sessionId).toBe(sessionId);
    expect(resolved?.expiresAt).toBe(expiresAt);
  });

  it('renews the idle window on a read and never past the absolute window', async () => {
    const { member, clock } = harness(60 * 60);
    const { sessionId } = await member.create({
      memberId: MEMBER_ID,
      at: iso(clock),
      expiresAt: iso(clock, 2 * 60 * 60),
      absoluteExpiresAt: iso(clock, 2 * 60 * 60),
    });

    clock.advance(50 * 60 * 1000);
    const renewed = await member.read(sessionId);
    // Fifty minutes in, an hour of idle still fits inside the absolute wall of two hours.
    expect(renewed?.expiresAt).toBe(iso(clock, 60 * 60));

    clock.advance(11 * 60 * 1000);
    const capped = await member.read(sessionId);
    // Now an hour of idle would pass the wall, so the absolute window is the ceiling.
    expect(capped?.expiresAt).toBe(iso(clock, 59 * 60));
  });

  it('caps a freshly opened session at the configured idle window', async () => {
    const { member, memory, clock } = harness(15 * 60);
    const { sessionId } = await member.create({
      memberId: MEMBER_ID,
      at: iso(clock),
      expiresAt: iso(clock, 12 * 60 * 60),
      absoluteExpiresAt: iso(clock, 12 * 60 * 60),
    });

    // The store does not leave a session live for twelve hours just because nobody read it.
    const opened = await member.read(sessionId);
    expect(opened?.expiresAt).toBe(iso(clock, 15 * 60));

    clock.advance(16 * 60 * 1000);
    await expect(member.read(sessionId)).resolves.toBeNull();
    expect(memory.keys()).toHaveLength(0);
  });

  it('refuses a session past its idle window and removes it', async () => {
    const { member, memory, clock } = harness(15 * 60);
    const { sessionId } = await member.create({
      memberId: MEMBER_ID,
      at: iso(clock),
      expiresAt: iso(clock, 12 * 60 * 60),
      absoluteExpiresAt: iso(clock, 12 * 60 * 60),
    });

    // One read is what brings the idle window down from the domain's twelve-hour ceiling.
    await expect(member.read(sessionId)).resolves.not.toBeNull();
    clock.advance(16 * 60 * 1000);
    await expect(member.read(sessionId)).resolves.toBeNull();
    expect(memory.keys()).toHaveLength(0);
  });

  it('ends the session it was given and answers an unknown token with null', async () => {
    const { member, clock } = harness();
    const expiresAt = iso(clock, 12 * 60 * 60);
    const { sessionId } = await member.create({
      memberId: MEMBER_ID,
      at: iso(clock),
      expiresAt,
      absoluteExpiresAt: expiresAt,
    });

    await member.end(sessionId);
    await expect(member.read(sessionId)).resolves.toBeNull();

    // A value that could not have been issued is never sent to the store.
    await expect(member.read('not-a-token')).resolves.toBeNull();
    await expect(member.read('')).resolves.toBeNull();
  });

  it('refuses a session window that has already closed', async () => {
    const { member, clock } = harness();
    await expect(
      member.create({
        memberId: MEMBER_ID,
        at: iso(clock),
        expiresAt: iso(clock, -1),
        absoluteExpiresAt: iso(clock, -1),
      }),
    ).rejects.toBeInstanceOf(RangeError);
  });

  it('reports an unreachable store rather than treating it as a signed-out caller', async () => {
    const clock = createFixedClock();
    const failing: SessionStore = {
      get: async () => {
        throw new SessionStoreUnavailableError();
      },
      set: async () => {
        throw new SessionStoreUnavailableError();
      },
      delete: async () => {
        throw new SessionStoreUnavailableError();
      },
      increment: async () => {
        throw new SessionStoreUnavailableError();
      },
      ttl: async () => -2,
      addToSet: async () => {
        throw new SessionStoreUnavailableError();
      },
      members: async () => {
        throw new SessionStoreUnavailableError();
      },
      removeFromSet: async () => {
        throw new SessionStoreUnavailableError();
      },
      ping: async () => false,
    };
    const member = createMemberSessionStore({ store: failing, clock, idleSeconds: 600 });

    await expect(
      member.create({
        memberId: MEMBER_ID,
        at: iso(clock),
        expiresAt: iso(clock, 600),
        absoluteExpiresAt: iso(clock, 600),
      }),
    ).rejects.toBeInstanceOf(SessionStoreUnavailableError);
    await expect(member.read('test-token-not-a-secret-0123456789abcdef012')).rejects.toBeInstanceOf(
      SessionStoreUnavailableError,
    );
  });
});

describe('staff sessions', () => {
  async function challenge(input: ReturnType<typeof harness>, seconds = 10 * 60) {
    return input.staff.create({
      staffId: STAFF_ID,
      at: iso(input.clock),
      expiresAt: iso(input.clock, seconds),
      absoluteExpiresAt: iso(input.clock, seconds),
    });
  }

  it('opens a challenge that admits the factor screens only', async () => {
    const input = harness();
    const { sessionId } = await challenge(input);

    const resolved = await input.staff.read(sessionId);
    expect(resolved?.staffId).toBe(STAFF_ID);
    expect(resolved?.secondFactorSatisfied).toBe(false);
    expect(resolved?.startedAt).toBe(iso(input.clock));
  });

  it('upgrades to the settled window and never moves the absolute anchor', async () => {
    const input = harness();
    const { sessionId } = await challenge(input);
    const passwordStep = iso(input.clock);

    input.clock.advance(2 * 60 * 1000);
    await input.staff.upgrade(sessionId, {
      secondFactorSatisfied: true,
      at: iso(input.clock),
      expiresAt: iso(input.clock, 30 * 60),
      absoluteExpiresAt: iso(input.clock, 8 * 60 * 60 - 2 * 60),
    });

    const resolved = await input.staff.read(sessionId);
    expect(resolved?.secondFactorSatisfied).toBe(true);
    expect(resolved?.startedAt).toBe(passwordStep);
    expect(resolved?.expiresAt).toBe(iso(input.clock, 30 * 60));
  });

  it('refuses to upgrade a challenge that expired', async () => {
    const input = harness();
    const { sessionId } = await challenge(input);

    input.clock.advance(11 * 60 * 1000);
    await expect(
      input.staff.upgrade(sessionId, {
        secondFactorSatisfied: true,
        at: iso(input.clock),
        expiresAt: iso(input.clock, 30 * 60),
        absoluteExpiresAt: iso(input.clock, 8 * 60 * 60),
      }),
    ).rejects.toBeInstanceOf(SessionNotFoundError);
  });

  it('ends every session a staff user holds, as a role change must', async () => {
    const input = harness();
    const first = await challenge(input);
    const second = await challenge(input);

    await input.staff.endAllForStaff(STAFF_ID);

    await expect(input.staff.read(first.sessionId)).resolves.toBeNull();
    await expect(input.staff.read(second.sessionId)).resolves.toBeNull();
    expect(input.memory.keys()).toHaveLength(0);
  });

  it('does not touch another staff user’s sessions', async () => {
    const input = harness();
    const other = 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NQ';
    const mine = await challenge(input);
    const theirs = await input.staff.create({
      staffId: other,
      at: iso(input.clock),
      expiresAt: iso(input.clock, 600),
      absoluteExpiresAt: iso(input.clock, 600),
    });

    await input.staff.endAllForStaff(STAFF_ID);

    await expect(input.staff.read(mine.sessionId)).resolves.toBeNull();
    await expect(input.staff.read(theirs.sessionId)).resolves.not.toBeNull();
  });

  it('ends the current session only on sign-out', async () => {
    const input = harness();
    const first = await challenge(input);
    const second = await challenge(input);

    await input.staff.end(first.sessionId);

    await expect(input.staff.read(first.sessionId)).resolves.toBeNull();
    await expect(input.staff.read(second.sessionId)).resolves.not.toBeNull();
  });
});
