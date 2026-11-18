/**
 * Sessions and counters against disposable Redis (`NFR-026`, `NFR-027`).
 *
 * The in-memory suites prove behaviour; this one proves the driver honours what the store assumes: a
 * TTL actually expires, an evicted key reads as absent rather than unavailable, a counter starts over
 * in a new window, and a refused connection is reported with the adapter's own cause.
 *
 * It reads `REDIS_URL` and skips when the local stack is not running, so the suite stays offline on a
 * machine without Docker and meaningful in CI where the Compose stack is up. Every key it writes is
 * removed or left to a short TTL.
 *
 * `packages/platform/AGENTS.md` puts integration suites under `test/`; this one sits beside the
 * adapter it covers because the issue's owned paths stop at `src/adapters/session/**`. The task
 * report names the one-line change that folds it into `test:integration`.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { systemClock } from '../../../clock/clock.ts';
import { SessionStoreUnavailableError } from '../../../ports/session-store.ts';
import { createSessionRedisConnection } from './client.ts';
import { digestSessionToken, sessionKey } from './keys.ts';
import { createFixedWindowRateLimiter } from './rate-limit.ts';
import { createMemberSessionStore } from './sessions.ts';
import { createRedisSessionStore } from './store.ts';

const url = process.env.REDIS_URL;
const suite = url === undefined ? describe.skip : describe;

suite('session store (integration)', () => {
  const connection = createSessionRedisConnection(url ?? 'redis://127.0.0.1:6379');
  const store = createRedisSessionStore(connection.commands);

  afterAll(async () => {
    await connection.close();
  });

  const isoIn = (seconds: number): string => new Date(Date.now() + seconds * 1000).toISOString();

  it('expires a session at its window and reads it as signed out', async () => {
    const member = createMemberSessionStore({ store, clock: systemClock, idleSeconds: 1 });
    const { sessionId } = await member.create({
      memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
      at: isoIn(0),
      expiresAt: isoIn(1),
      absoluteExpiresAt: isoIn(1),
    });

    await expect(member.read(sessionId)).resolves.not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1200));

    await expect(member.read(sessionId)).resolves.toBeNull();
    await member.end(sessionId);
  });

  it('reads an evicted session as absent, not as an unavailable store', async () => {
    const member = createMemberSessionStore({ store, clock: systemClock, idleSeconds: 60 });
    const { sessionId } = await member.create({
      memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
      at: isoIn(0),
      expiresAt: isoIn(60),
      absoluteExpiresAt: isoIn(60),
    });

    // An eviction removes the entry without telling anyone; the next read must be a plain miss.
    await connection.commands.deleteMany([sessionKey('member', digestSessionToken(sessionId))]);

    await expect(member.read(sessionId)).resolves.toBeNull();
    await member.end(sessionId);
  });

  it('starts a counter over when the fixed window turns over', async () => {
    const limits = createFixedWindowRateLimiter({
      store,
      clock: systemClock,
      policies: { sign_in: { limit: 1, windowSeconds: 1 } },
    });
    const subject = { kind: 'address' as const, value: '203.0.113.7' };

    await expect(limits.consume({ bucket: 'sign_in', subject })).resolves.toMatchObject({
      allowed: true,
    });
    await expect(limits.consume({ bucket: 'sign_in', subject })).resolves.toMatchObject({
      allowed: false,
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));
    await expect(limits.consume({ bucket: 'sign_in', subject })).resolves.toMatchObject({
      allowed: true,
    });
  });

  it('reports an unreachable Redis as unavailable, never as a miss', async () => {
    const offline = createSessionRedisConnection('redis://127.0.0.1:1');
    const failing = createRedisSessionStore(offline.commands);
    try {
      await expect(failing.get('odp:v1:sess:member:offline')).rejects.toBeInstanceOf(
        SessionStoreUnavailableError,
      );
      await expect(failing.ping()).resolves.toBe(false);
    } finally {
      await offline.close();
    }
  });
});
