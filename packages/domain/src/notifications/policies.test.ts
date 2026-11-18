/**
 * The notification boundary's rules (`C-076`, `NFR-004`, `NFR-024`).
 *
 * Four things are proven here, each of which would be invisible if the policy were spread across the use
 * cases: the retry schedule is the one the contract prints, a payload cannot carry the message or the
 * code, a recipient reference cannot name the wrong kind of record, and a hold is derived rather than
 * stored.
 */
import { describe, expect, it } from 'vitest';
import type { OutboundNotification } from './entities.ts';
import {
  DEFAULT_NOTIFICATION_RETRY_POLICY,
  firstAttemptAt,
  isHeld,
  isTerminalState,
  nextAttemptAt,
  readChannel,
  readDedupeKey,
  readLimit,
  readPayload,
  readRecipient,
  readTemplate,
  recordAttempt,
  recordViewOf,
  retryDelaySeconds,
} from './policies.ts';

const flow = DEFAULT_NOTIFICATION_RETRY_POLICY;

const attemptBase = {
  at: '2026-11-18T09:14:00Z',
  policy: flow,
} as const;

describe('notification retry policy', () => {
  it('starts at the thirty seconds C-076 prints and doubles to the ceiling', () => {
    // `C-076`'s example queues at 12:00:00 and is due at 12:00:30.
    expect(retryDelaySeconds(1, flow)).toBe(30);
    expect(retryDelaySeconds(2, flow)).toBe(60);
    expect(retryDelaySeconds(3, flow)).toBe(120);
    expect(retryDelaySeconds(4, flow)).toBe(240);
    expect(retryDelaySeconds(5, flow)).toBe(300);
    // Ten attempts is far past the budget; the ceiling still holds, so no wait is unbounded.
    expect(retryDelaySeconds(10, flow)).toBe(300);
  });

  it('dates the first attempt and each retry from the instant it was earned', () => {
    expect(firstAttemptAt('2026-11-18T09:14:00Z', flow)).toBe('2026-11-18T09:14:30Z');
    expect(nextAttemptAt('2026-11-18T09:14:00Z', 2, flow)).toBe('2026-11-18T09:15:00Z');
  });
});

describe('one attempt', () => {
  it('records an accepted message as sent and schedules nothing further', () => {
    const attempt = recordAttempt({
      ...attemptBase,
      attemptsBefore: 0,
      outcome: 'delivered',
      messageRef: 'gateway-1',
      cause: null,
    });
    expect(attempt).toMatchObject({
      state: 'sent',
      attempts: 1,
      outcome: 'delivered',
      messageRef: 'gateway-1',
      cause: null,
    });
    expect(attempt.nextAttemptAt).toBeUndefined();
  });

  it('retries a held message on the schedule while the budget lasts', () => {
    const attempt = recordAttempt({
      ...attemptBase,
      attemptsBefore: 0,
      outcome: 'held',
      messageRef: null,
      cause: 'PROVIDER_UNAVAILABLE',
    });
    expect(attempt.state).toBe('queued');
    expect(attempt.nextAttemptAt).toBe('2026-11-18T09:14:30Z');
  });

  it('gives up on a held message when the attempt budget runs out, keeping the record', () => {
    const attempt = recordAttempt({
      ...attemptBase,
      attemptsBefore: flow.maxAttempts - 1,
      outcome: 'held',
      messageRef: null,
      cause: 'PROVIDER_UNAVAILABLE',
    });
    expect(attempt.state).toBe('failed');
    expect(attempt.attempts).toBe(flow.maxAttempts);
    expect(attempt.nextAttemptAt).toBeUndefined();
  });

  it('fails at once when the gateway refused the message', () => {
    // Retrying a refused message unchanged cannot help, so the schedule never applies.
    const attempt = recordAttempt({
      ...attemptBase,
      attemptsBefore: 0,
      outcome: 'failed',
      messageRef: null,
      cause: 'PROVIDER_REQUEST_INVALID',
    });
    expect(attempt.state).toBe('failed');
    expect(attempt.nextAttemptAt).toBeUndefined();
  });
});

describe('the queued record', () => {
  const record: OutboundNotification = {
    id: 'ntf_01J9ZN1P3Q5R7S9T1V3W5X7YZ',
    channel: 'sms',
    template: 'registration_code',
    recipient: { kind: 'pending_registration', id: 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9' },
    payload: { targetId: 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9', expiresInMinutes: '10' },
    dedupeKey: 'registration_code:prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9',
    state: 'queued',
    attempts: 1,
    nextAttemptAt: '2026-11-18T09:14:30Z',
    createdAt: '2026-11-18T09:14:00Z',
    lastAttemptAt: '2026-11-18T09:14:00Z',
    lastOutcome: 'held',
    lastCause: 'PROVIDER_UNAVAILABLE',
  };

  it('derives held from the state and the last outcome rather than storing it', () => {
    expect(isHeld(record)).toBe(true);
    expect(isHeld({ ...record, state: 'sent' })).toBe(false);
    expect(isHeld({ ...record, lastOutcome: 'delivered' })).toBe(false);
  });

  it('answers the six fields C-076 prints plus the times, and no destination, body or code', () => {
    const view = recordViewOf(record);
    expect(Object.keys(view).sort()).toEqual(
      [
        'attempts',
        'channel',
        'createdAt',
        'held',
        'lastAttemptAt',
        'lastCause',
        'lastOutcome',
        'nextAttemptAt',
        'notificationId',
        'state',
        'template',
      ].sort(),
    );
    expect(view).toMatchObject({
      notificationId: record.id,
      channel: 'sms',
      state: 'queued',
      attempts: 1,
      nextAttemptAt: '2026-11-18T09:14:30Z',
      held: true,
    });
    const serialised = JSON.stringify(record);
    expect(serialised).not.toContain('+234');
    expect(serialised).not.toContain('code is');
  });

  it('knows which states are finished with', () => {
    expect(isTerminalState('queued')).toBe(false);
    expect(isTerminalState('sent')).toBe(true);
    expect(isTerminalState('failed')).toBe(true);
  });
});

describe('reading an untrusted request', () => {
  it('refuses a channel or a template outside the frozen sets', () => {
    expect(readChannel('email')).toEqual({ ok: false, field: 'channel', reason: 'ENUM_MISMATCH' });
    expect(readTemplate('password_reset')).toEqual({
      ok: false,
      field: 'template',
      reason: 'ENUM_MISMATCH',
    });
    expect(readChannel('sms')).toEqual({ ok: true, value: 'sms' });
  });

  it('refuses a payload key the template does not declare', () => {
    // The queue is durable: a rendered body or a one-time code stored here would outlive the send.
    const refused = readPayload('registration_code', { targetId: 'prg_0001', code: '418302' });
    expect(refused).toEqual({ ok: false, field: 'payload.code', reason: 'UNKNOWN_FIELD' });

    const accepted = readPayload('registration_code', {
      targetId: 'prg_0001',
      expiresInMinutes: '10',
    });
    expect(accepted).toEqual({ ok: true, value: { targetId: 'prg_0001', expiresInMinutes: '10' } });
  });

  it('refuses a payload value long enough to carry prose', () => {
    const refused = readPayload('decision_published', { reference: 'x'.repeat(201) });
    expect(refused).toEqual({ ok: false, field: 'payload.reference', reason: 'TOO_LONG' });
  });

  it('refuses a recipient whose prefix names another kind of record', () => {
    expect(readRecipient({ kind: 'member', id: 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9' })).toEqual({
      ok: false,
      field: 'recipient.id',
      reason: 'PATTERN_MISMATCH',
    });
    expect(readRecipient({ kind: 'member', id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' })).toEqual({
      ok: true,
      value: { kind: 'member', id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' },
    });
    expect(readRecipient({ kind: 'handset', id: 'mbr_0001' })).toEqual({
      ok: false,
      field: 'recipient.kind',
      reason: 'ENUM_MISMATCH',
    });
  });

  it('refuses a dedupe key that is not namespaced identifiers', () => {
    expect(readDedupeKey('decision:dec_01J9ZB1C3D5E7F9G1H3J5K7LMP')).toEqual({
      ok: true,
      value: 'decision:dec_01J9ZB1C3D5E7F9G1H3J5K7LMP',
    });
    expect(readDedupeKey('Seun A. decision')).toEqual({
      ok: false,
      field: 'dedupeKey',
      reason: 'PATTERN_MISMATCH',
    });
  });

  it('reads a page size under the C-001 convention', () => {
    expect(readLimit(undefined)).toEqual({ ok: true, value: 20 });
    expect(readLimit(50)).toEqual({ ok: true, value: 50 });
    expect(readLimit(51)).toEqual({ ok: false, field: 'limit', reason: 'OUT_OF_BAND' });
    expect(readLimit(0)).toEqual({ ok: false, field: 'limit', reason: 'OUT_OF_BAND' });
  });
});
