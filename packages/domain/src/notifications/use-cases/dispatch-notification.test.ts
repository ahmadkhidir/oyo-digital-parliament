/**
 * Delivering queued notices (`C-076`, `NFR-004`).
 *
 * The three behaviours that matter operationally, each proven against a real policy rather than a mock:
 * a delivered code reports `sent`; an outage reports a hold without throwing, and the queued row and the
 * pending registration both survive it; and a replay — of the call, of a sweep, of a whole run after a
 * stall — never sends the same message twice.
 */
import { describe, expect, it } from 'vitest';
import { dispatchNotification, flushDueNotifications } from './dispatch-notification.ts';
import { enqueueNotification } from './enqueue-notification.ts';
import { getDeliveryState } from './get-delivery-state.ts';
import { listHeldNotifications } from './list-held-notifications.ts';
import { createNotificationFakes } from '../fakes.ts';
import { DEFAULT_NOTIFICATION_RETRY_POLICY } from '../policies.ts';

const caller = { component: 'identity', correlationId: 'req_01J9Z6M2V4' };
const sweepCaller = { component: 'worker' };

const pendingRegistration = 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9';

const heldResult = {
  outcome: 'held' as const,
  messageRef: null,
  cause: 'PROVIDER_UNAVAILABLE' as const,
};

function harness(recipients = [{ id: pendingRegistration, locale: 'en-NG' as const, smsDestination: '+2348031234567' }]) {
  return createNotificationFakes({ recipients });
}

async function queueCode(fake: ReturnType<typeof harness>, dedupeSuffix = '1'): Promise<string> {
  const queued = await enqueueNotification(caller, fake.ports, {
    channel: 'sms',
    template: 'registration_code',
    recipient: { kind: 'pending_registration', id: pendingRegistration },
    payload: { targetId: pendingRegistration, expiresInMinutes: '10' },
    dedupeKey: `registration_code:${pendingRegistration}:${dedupeSuffix}`,
  });
  if (!queued.ok) throw new Error('the code could not be queued');
  return queued.notification.notificationId;
}

describe('dispatching one notice', () => {
  it('reports sent when the gateway accepted the message', async () => {
    const fake = harness();
    const notificationId = await queueCode(fake);

    const dispatched = await dispatchNotification(caller, fake.ports, { notificationId });

    expect(dispatched).toMatchObject({
      ok: true,
      notification: { notificationId, state: 'sent', attempts: 1, held: false },
    });
    if (dispatched.ok) expect(dispatched.notification.sentAt).toBe('2026-11-18T09:14:00Z');
    expect(fake.sent).toHaveLength(1);
  });

  it('returns a held result during an outage instead of throwing into the registration write', async () => {
    const fake = harness();
    fake.queueSms(heldResult);
    const notificationId = await queueCode(fake);

    const dispatched = await dispatchNotification(caller, fake.ports, { notificationId });

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
    // The message is retained rather than lost, and the pending registration is untouched.
    expect(fake.rows).toHaveLength(1);
    expect(fake.rows[0]?.state).toBe('queued');
  });

  it('gives up after the attempt budget and keeps the failed row', async () => {
    const fake = harness();
    for (let attempt = 0; attempt < DEFAULT_NOTIFICATION_RETRY_POLICY.maxAttempts; attempt += 1) {
      fake.queueSms(heldResult);
    }
    const notificationId = await queueCode(fake);

    let last = await dispatchNotification(caller, fake.ports, { notificationId });
    for (let attempt = 1; attempt < DEFAULT_NOTIFICATION_RETRY_POLICY.maxAttempts; attempt += 1) {
      last = await dispatchNotification(caller, fake.ports, { notificationId });
    }

    expect(last).toMatchObject({
      ok: true,
      notification: {
        state: 'failed',
        attempts: DEFAULT_NOTIFICATION_RETRY_POLICY.maxAttempts,
        held: false,
      },
    });
    expect(fake.sent).toHaveLength(DEFAULT_NOTIFICATION_RETRY_POLICY.maxAttempts);
    expect(fake.rows).toHaveLength(1);
  });

  it('sends once when the same dispatch is replayed', async () => {
    const fake = harness();
    const notificationId = await queueCode(fake);

    await dispatchNotification(caller, fake.ports, { notificationId });
    const replay = await dispatchNotification(caller, fake.ports, { notificationId });

    expect(replay).toMatchObject({ ok: true, notification: { state: 'sent' } });
    expect(fake.sent).toHaveLength(1);
  });

  it('fails the message when the recipient has been anonymised since it was queued', async () => {
    const fake = harness();
    const notificationId = await queueCode(fake);
    fake.removeRecipient(pendingRegistration);

    const dispatched = await dispatchNotification(caller, fake.ports, { notificationId });

    expect(dispatched).toMatchObject({
      ok: true,
      notification: { state: 'failed', lastCause: 'RECIPIENT_GONE' },
    });
    expect(fake.sent).toHaveLength(0);
  });

  it('fails the message when no body can be rendered, never sending an empty one', async () => {
    const fake = harness();
    const notificationId = await queueCode(fake);
    fake.setBodyAvailable(false);

    const dispatched = await dispatchNotification(caller, fake.ports, { notificationId });

    expect(dispatched).toMatchObject({
      ok: true,
      notification: { state: 'failed', lastCause: 'TEMPLATE_UNAVAILABLE' },
    });
    expect(fake.sent).toHaveLength(0);
  });

  it('answers NOT_FOUND for an identifier that names no notice', async () => {
    const fake = harness();
    const result = await dispatchNotification(caller, fake.ports, {
      notificationId: 'ntf_01J9ZN1P3Q5R7S9T1V3W5X7YZ',
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});

describe('flushing the due queue', () => {
  it('delivers what is due and claims nothing on a second run at the same instant', async () => {
    const fake = harness([
      { id: pendingRegistration, locale: 'en-NG', smsDestination: '+2348031234567' },
    ]);
    await queueCode(fake, '1');
    await queueCode(fake, '2');
    // Nothing is due until the first attempt's instant.
    fake.advanceTo('2026-11-18T09:14:30Z');

    const first = await flushDueNotifications(sweepCaller, fake.ports);
    expect(first).toEqual({ ok: true, attempted: 2, delivered: 2, held: 0, failed: 0 });

    const second = await flushDueNotifications(sweepCaller, fake.ports);
    expect(second).toEqual({ ok: true, attempted: 0, delivered: 0, held: 0, failed: 0 });
    expect(fake.sent).toHaveLength(2);
  });

  it('leaves a held message for its next attempt rather than retrying it in place', async () => {
    const fake = harness();
    fake.queueSms(heldResult);
    await queueCode(fake);
    fake.advanceTo('2026-11-18T09:14:30Z');

    const first = await flushDueNotifications(sweepCaller, fake.ports);
    expect(first).toEqual({ ok: true, attempted: 1, delivered: 0, held: 1, failed: 0 });

    // The next sweep inside the retry window attempts nothing: the schedule decides, not the caller.
    const again = await flushDueNotifications(sweepCaller, fake.ports);
    expect(again).toEqual({ ok: true, attempted: 0, delivered: 0, held: 0, failed: 0 });

    fake.advanceTo('2026-11-18T09:15:00Z');
    const later = await flushDueNotifications(sweepCaller, fake.ports);
    expect(later).toEqual({ ok: true, attempted: 1, delivered: 1, held: 0, failed: 0 });
  });

  it('refuses a batch size outside the C-001 page convention', async () => {
    const fake = harness();
    const refused = await flushDueNotifications(sweepCaller, fake.ports, { limit: 51 });
    expect(refused).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'NOTIFICATION_LIMIT_OUT_OF_BAND',
    });
  });
});

describe('reading the queue', () => {
  it('lists only the messages the channel is holding, one page at a time', async () => {
    const fake = harness();
    fake.queueSms(heldResult, heldResult, heldResult);
    const first = await queueCode(fake, '1');
    const second = await queueCode(fake, '2');
    await dispatchNotification(caller, fake.ports, { notificationId: first });
    await dispatchNotification(caller, fake.ports, { notificationId: second });

    const page = await listHeldNotifications(sweepCaller, fake.ports, { limit: 1 });
    expect(page.ok).toBe(true);
    if (!page.ok) return;
    expect(page.notifications).toHaveLength(1);
    expect(page.notifications[0]?.held).toBe(true);
    expect(page.nextCursor).not.toBeNull();

    const next = await listHeldNotifications(sweepCaller, fake.ports, {
      limit: 1,
      ...(page.nextCursor === null ? {} : { cursor: page.nextCursor }),
    });
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.notifications).toHaveLength(1);
    expect(next.notifications[0]?.notificationId).not.toBe(page.notifications[0]?.notificationId);
  });

  it('reports one message by identifier, and refuses a malformed one', async () => {
    const fake = harness();
    const notificationId = await queueCode(fake);

    const read = await getDeliveryState(caller, fake.ports, { notificationId });
    expect(read).toMatchObject({ ok: true, notification: { notificationId, state: 'queued' } });

    const refused = await getDeliveryState(caller, fake.ports, { notificationId: 'nope' });
    expect(refused).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { notificationId: 'PATTERN_MISMATCH' },
    });
  });
});
