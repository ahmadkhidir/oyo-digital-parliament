/**
 * Queueing a notice (`C-076` `enqueue`, `FEAT-001`).
 *
 * The behaviour under test is the one the registration screen depends on: the notice is queued with a
 * first attempt half a minute away, a replay queues one message and not two, and nothing about the
 * message — destination, body or code — is stored with it.
 */
import { describe, expect, it } from 'vitest';
import { enqueueNotification } from './enqueue-notification.ts';
import { createNotificationFakes } from '../fakes.ts';

const caller = { component: 'identity', correlationId: 'req_01J9Z6M2V4' };

const pendingRegistration = 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9';

function harness() {
  return createNotificationFakes({
    recipients: [{ id: pendingRegistration, locale: 'en-NG', smsDestination: '+2348031234567' }],
  });
}

describe('enqueueNotification', () => {
  it('queues a one-time code for a pending registration, due in thirty seconds', async () => {
    const fake = harness();
    const result = await enqueueNotification(caller, fake.ports, {
      channel: 'sms',
      template: 'registration_code',
      recipient: { kind: 'pending_registration', id: pendingRegistration },
      payload: { targetId: pendingRegistration, expiresInMinutes: '10' },
      dedupeKey: `registration_code:${pendingRegistration}`,
    });

    expect(result).toEqual({
      ok: true,
      notification: {
        notificationId: 'ntf_0001',
        channel: 'sms',
        state: 'queued',
        attempts: 0,
        nextAttemptAt: '2026-11-18T09:14:30Z',
        held: false,
      },
    });
    expect(fake.rows).toHaveLength(1);
    expect(fake.sent).toHaveLength(0);
  });

  it('returns the existing message for a replayed dedupe key instead of queueing a second', async () => {
    const fake = harness();
    const input = {
      channel: 'sms',
      template: 'registration_code',
      recipient: { kind: 'pending_registration', id: pendingRegistration },
      payload: { targetId: pendingRegistration, expiresInMinutes: '10' },
      dedupeKey: `registration_code:${pendingRegistration}`,
    };

    const first = await enqueueNotification(caller, fake.ports, input);
    const second = await enqueueNotification(caller, fake.ports, input);

    expect(first).toEqual(second);
    expect(fake.rows).toHaveLength(1);
  });

  it('stores no destination, body or code with the queued message', async () => {
    const fake = harness();
    await enqueueNotification(caller, fake.ports, {
      channel: 'sms',
      template: 'registration_code',
      recipient: { kind: 'pending_registration', id: pendingRegistration },
      payload: { targetId: pendingRegistration, expiresInMinutes: '10' },
      dedupeKey: `registration_code:${pendingRegistration}`,
    });

    const stored = JSON.stringify(fake.rows);
    expect(stored).not.toContain('+2348031234567');
    expect(stored).not.toContain('418302');
    expect(Object.keys(fake.rows[0] ?? {})).not.toContain('body');
  });

  it('refuses an unknown channel or template, naming the field', async () => {
    const fake = harness();
    const refused = await enqueueNotification(caller, fake.ports, {
      channel: 'email',
      template: 'password_reset',
      recipient: { kind: 'member', id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' },
      dedupeKey: 'decision:dec_01J9ZB1C3D5E7F9G1H3J5K7LMP',
    });

    expect(refused).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      cause: 'NOTIFICATION_INVALID',
      fields: { channel: 'ENUM_MISMATCH', template: 'ENUM_MISMATCH' },
    });
    expect(fake.rows).toHaveLength(0);
  });

  it('refuses a payload key the template does not declare, so no code can be stored', async () => {
    const fake = harness();
    const refused = await enqueueNotification(caller, fake.ports, {
      channel: 'sms',
      template: 'registration_code',
      recipient: { kind: 'pending_registration', id: pendingRegistration },
      payload: { targetId: pendingRegistration, code: '418302' },
      dedupeKey: `registration_code:${pendingRegistration}`,
    });

    expect(refused).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { 'payload.code': 'UNKNOWN_FIELD' },
    });
    expect(fake.rows).toHaveLength(0);
  });

  it('answers NOT_FOUND for a recipient with no live record', async () => {
    const fake = harness();
    const refused = await enqueueNotification(caller, fake.ports, {
      channel: 'sms',
      template: 'decision_published',
      recipient: { kind: 'member', id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' },
      payload: { reference: 'ODP-004821', decisionType: 'commit' },
      dedupeKey: 'decision:dec_01J9ZB1C3D5E7F9G1H3J5K7LMP',
    });

    expect(refused).toMatchObject({ ok: false, code: 'NOT_FOUND', cause: 'RECIPIENT_NOT_FOUND' });
    expect(fake.rows).toHaveLength(0);
  });

  it('answers SERVICE_DEGRADED and queues nothing when the store cannot take the write', async () => {
    const fake = harness();
    fake.setQueueAvailable(false);

    const refused = await enqueueNotification(caller, fake.ports, {
      channel: 'in_product',
      template: 'session_reminder',
      recipient: { kind: 'pending_registration', id: pendingRegistration },
      payload: { sessionId: 'ses_01J9Z5A1B2C3D4E5F6G7H8J9K', startsAt: '2026-12-01T10:00:00Z' },
      dedupeKey: 'session_reminder:ses_01J9Z5A1B2C3D4E5F6G7H8J9K',
    });

    expect(refused).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'NOTIFICATION_QUEUE_UNAVAILABLE',
    });
    expect(fake.rows).toHaveLength(0);
  });
});
