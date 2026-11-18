/**
 * The outbound queue against a real database, with the SMS double (`C-076`, `FEAT-001`, `NFR-004`).
 *
 * This is the integration half of the notification boundary: the same use cases the application calls,
 * the repository that really stores the rows, and the platform's scripted SMS double in place of a
 * gateway. What it proves cannot be proven in memory:
 *
 * - the dedupe key is enforced by a unique index, so a replay queues one message even when two callers
 *   race;
 * - a claim is a conditional write, so two dispatchers cannot both own a row;
 * - a simulated outage leaves the message queued with its next attempt scheduled, and the pending
 *   registration untouched and unverified;
 * - the stored row carries no destination number, no message body and no one-time code.
 *
 * The doubles come from `packages/platform/src/testing/` by path rather than by package dependency,
 * because adding `@odp/platform` to this package's manifest is outside this issue's owned paths; the
 * shapes are the platform's own `ClockPort` and `SmsDeliveryPort` doubles, not look-alikes.
 */
import { describe, expect, it } from 'vitest';
import type {
  NotificationPorts,
  NotificationRecipient,
  SmsDeliveryResult,
} from '@odp/domain';
import {
  dispatchNotification,
  enqueueNotification,
  flushDueNotifications,
  getDeliveryState,
  listHeldNotifications,
} from '@odp/domain';
import {
  createDeterministicIds,
  createFakeSms,
  createFixedClock,
  identifierPortOf,
} from '../../../platform/src/testing/index.ts';
import { createOutboundNotificationRepository } from './outbound-notification.repository.ts';
import { createPendingRegistrationRepository } from './pending-registration.repository.ts';
import { createTestDatabase, testId, type TestDatabase } from '../testing/index.ts';

const caller = { component: 'identity', correlationId: 'req_01J9Z6M2V4' };
const sweepCaller = { component: 'worker' };

/** The destination only ever exists in this test's memory, never in a row. */
const DESTINATION = '+2348031234567';
/** The digits the body port renders. The queue must never hold them. */
const CODE = '418302';

interface Harness {
  readonly ports: NotificationPorts;
  readonly sms: ReturnType<typeof createFakeSms>;
  readonly clock: ReturnType<typeof createFixedClock>;
  readonly repository: ReturnType<typeof createOutboundNotificationRepository>;
  readonly pending: ReturnType<typeof createPendingRegistrationRepository>;
  readonly database: TestDatabase;
  /** The recipients the boundary may resolve. A test adds to it after creating a record. */
  readonly recipients: Map<string, NotificationRecipient>;
}

/**
 * Build the boundary over a disposable database.
 *
 * @param database - The migrated test database.
 * @param gateway - The SMS double's default answer; a hold models an outage.
 */
async function harness(
  database: TestDatabase,
  gateway: SmsDeliveryResult = { outcome: 'delivered', messageRef: 'gateway-1', cause: null },
): Promise<Harness> {
  const clock = createFixedClock('2026-11-18T09:14:00Z');
  const sms = createFakeSms(gateway);
  const repository = createOutboundNotificationRepository(database.db);
  const pending = createPendingRegistrationRepository(database.db);
  const recipients = new Map<string, NotificationRecipient>();

  const ports: NotificationPorts = {
    queue: repository,
    recipients: {
      async resolve(reference) {
        return recipients.get(reference.id) ?? null;
      },
    },
    bodies: {
      // The renderer is where the digits appear; the queue never sees them.
      async render() {
        return `Your Oyo Digital Parliament code is ${CODE}.`;
      },
    },
    sms,
    clock,
    identifiers: identifierPortOf(createDeterministicIds()),
  };

  return { ports, sms, clock, repository, pending, database, recipients };
}

/** Create one pending registration and make it a known recipient. */
async function seedPendingRegistration(
  harnessed: Harness,
  telephoneNumber = DESTINATION,
): Promise<string> {
  const id = testId('prg');
  await harnessed.pending.create({
    id,
    telephoneNumber,
    fullName: 'Oluwaseun Adeyemi',
    displayName: 'Seun A.',
    declaredAge: 24,
    locale: 'en-NG',
    codeSentAt: '2026-11-18T09:14:00Z',
    expiresAt: '2026-11-19T09:14:00Z',
    createdAt: '2026-11-18T09:14:00Z',
  });
  harnessed.recipients.set(id, { locale: 'en-NG', smsDestination: telephoneNumber });
  return id;
}

/** Queue one one-time code for a pending registration. */
async function queueCode(harnessed: Harness, pendingRegistrationId: string, suffix = '1') {
  return enqueueNotification(caller, harnessed.ports, {
    channel: 'sms',
    template: 'registration_code',
    recipient: { kind: 'pending_registration', id: pendingRegistrationId },
    payload: { targetId: pendingRegistrationId, expiresInMinutes: '10' },
    dedupeKey: `registration_code:${pendingRegistrationId}:${suffix}`,
  });
}

describe('outbound notification queue', () => {
  it('queues one message and delivers it through the SMS double', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database);
      const pendingId = await seedPendingRegistration(harnessed);

      const queued = await queueCode(harnessed, pendingId);
      expect(queued).toMatchObject({
        ok: true,
        notification: { state: 'queued', attempts: 0, held: false },
      });
      const notificationId = queued.ok ? queued.notification.notificationId : '';

      const dispatched = await dispatchNotification(caller, harnessed.ports, { notificationId });
      expect(dispatched).toMatchObject({
        ok: true,
        notification: { notificationId, state: 'sent', attempts: 1, held: false },
      });
      expect(harnessed.sms.sent).toHaveLength(1);
      expect(harnessed.sms.sent[0]?.destination).toBe(DESTINATION);
    } finally {
      await database.dispose();
    }
  });

  it('stores no destination, body or code with the queued message', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database);
      const pendingId = await seedPendingRegistration(harnessed);
      const queued = await queueCode(harnessed, pendingId);
      const notificationId = queued.ok ? queued.notification.notificationId : '';
      await dispatchNotification(caller, harnessed.ports, { notificationId });

      const stored = await database.pool.query<Record<string, unknown>>(
        'select * from outbound_notification where id = $1',
        [notificationId],
      );
      const serialised = JSON.stringify(stored.rows[0]);
      expect(serialised).not.toContain(DESTINATION);
      expect(serialised).not.toContain(CODE);
      expect(serialised).not.toContain('code is');
      expect(stored.rows[0]?.payload).toEqual({ targetId: pendingId, expiresInMinutes: '10' });
      // The recipient is an identifier, never a person.
      expect(stored.rows[0]?.recipient_id).toBe(pendingId);
    } finally {
      await database.dispose();
    }
  });

  it('holds the message through an outage and leaves the pending registration intact', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database, {
        outcome: 'held' as const,
        messageRef: null,
        cause: 'PROVIDER_UNAVAILABLE' as const,
      });
      const pendingId = await seedPendingRegistration(harnessed);
      const queued = await queueCode(harnessed, pendingId);
      const notificationId = queued.ok ? queued.notification.notificationId : '';

      const dispatched = await dispatchNotification(caller, harnessed.ports, { notificationId });

      expect(dispatched).toMatchObject({
        ok: true,
        notification: {
          notificationId,
          state: 'queued',
          attempts: 1,
          held: true,
          nextAttemptAt: '2026-11-18T09:14:30Z',
          lastCause: 'PROVIDER_UNAVAILABLE',
        },
      });

      // The form is still there, still unverified, and its twenty-four hours are untouched.
      const pending = await harnessed.pending.findById(pendingId);
      expect(pending).not.toBeNull();
      expect(pending?.verifiedAt).toBeUndefined();
      expect(pending?.expiresAt).toBe('2026-11-19T09:14:00Z');

      // The held message is the operator's view, not a lost send.
      const held = await listHeldNotifications(sweepCaller, harnessed.ports);
      expect(held).toMatchObject({ ok: true });
      if (held.ok) {
        expect(held.notifications.map((row) => row.notificationId)).toEqual([notificationId]);
      }
    } finally {
      await database.dispose();
    }
  });

  it('retries the held message on the schedule and delivers it once the gateway returns', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database, {
        outcome: 'held' as const,
        messageRef: null,
        cause: 'PROVIDER_UNAVAILABLE' as const,
      });
      const pendingId = await seedPendingRegistration(harnessed);
      const queued = await queueCode(harnessed, pendingId);
      const notificationId = queued.ok ? queued.notification.notificationId : '';

      await dispatchNotification(caller, harnessed.ports, { notificationId });

      // Nothing is due before the retry instant.
      const early = await flushDueNotifications(sweepCaller, harnessed.ports);
      expect(early).toEqual({ ok: true, attempted: 0, delivered: 0, held: 0, failed: 0 });

      harnessed.sms.queue({ outcome: 'delivered', messageRef: 'gateway-2', cause: null });
      harnessed.clock.advance(30_000);
      const later = await flushDueNotifications(sweepCaller, harnessed.ports);

      expect(later).toEqual({ ok: true, attempted: 1, delivered: 1, held: 0, failed: 0 });
      const read = await getDeliveryState(caller, harnessed.ports, { notificationId });
      expect(read).toMatchObject({ ok: true, notification: { state: 'sent', attempts: 2 } });
    } finally {
      await database.dispose();
    }
  });

  it('queues one message for a replayed dedupe key, even across two store calls', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database);
      const pendingId = await seedPendingRegistration(harnessed);

      const first = await queueCode(harnessed, pendingId);
      const second = await queueCode(harnessed, pendingId);
      expect(second).toEqual(first);

      const count = await database.pool.query<{ count: string }>(
        'select count(*)::text as count from outbound_notification',
      );
      expect(count.rows[0]?.count).toBe('1');
    } finally {
      await database.dispose();
    }
  });

  it('lets exactly one dispatcher claim a message at a time', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database);
      const pendingId = await seedPendingRegistration(harnessed);
      const queued = await queueCode(harnessed, pendingId);
      const notificationId = queued.ok ? queued.notification.notificationId : '';

      const at = '2026-11-18T09:14:30Z';
      const leaseUntil = '2026-11-18T09:15:30Z';
      const first = await harnessed.repository.claimById({ notificationId, at, leaseUntil });
      const second = await harnessed.repository.claimById({ notificationId, at, leaseUntil });

      expect(first).not.toBeNull();
      expect(second).toBeNull();
      // The first holder's token finishes the attempt; a stale token is refused.
      const stale = await harnessed.repository.recordAttempt({
        notificationId,
        leaseToken: 'stale-lease',
        attempt: {
          at,
          outcome: 'delivered',
          messageRef: 'gateway-9',
          cause: null,
          state: 'sent',
          attempts: 1,
        },
      });
      expect(stale).toBeNull();
    } finally {
      await database.dispose();
    }
  });

  it('does not send a message twice when the same dispatch call is replayed', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database);
      const pendingId = await seedPendingRegistration(harnessed);
      const queued = await queueCode(harnessed, pendingId);
      const notificationId = queued.ok ? queued.notification.notificationId : '';

      await dispatchNotification(caller, harnessed.ports, { notificationId });
      const replay = await dispatchNotification(caller, harnessed.ports, { notificationId });

      expect(replay).toMatchObject({ ok: true, notification: { state: 'sent' } });
      expect(harnessed.sms.sent).toHaveLength(1);
    } finally {
      await database.dispose();
    }
  });

  it('refuses a row whose recipient kind and prefix disagree', async () => {
    const database = await createTestDatabase();
    try {
      const harnessed = await harness(database);
      await expect(
        harnessed.repository.enqueue({
          id: testId('ntf'),
          channel: 'sms',
          template: 'registration_code',
          recipient: { kind: 'member', id: testId('prg') },
          payload: {},
          dedupeKey: 'registration_code:mismatch',
          state: 'queued',
          attempts: 0,
          nextAttemptAt: '2026-11-18T09:14:30Z',
          createdAt: '2026-11-18T09:14:00Z',
        }),
      ).rejects.toMatchObject({ cause: { code: '23514' } });
    } finally {
      await database.dispose();
    }
  });
});
