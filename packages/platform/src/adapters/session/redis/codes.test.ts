/**
 * The one-time-code store (`NFR-020`, `C-002` to `C-006`).
 *
 * The suite proves what the contracts rely on: the digits are never stored or logged, a wrong code is
 * reported as a mismatch while a closed window or a consumed code is reported as absent, the third wrong
 * code's cooldown is reported, a resend starts the count again, and a gateway that did not accept the
 * message leaves no code behind (`C-002` to `C-006`).
 */
import { describe, expect, it } from 'vitest';

import { createFakeSms } from '../../../testing/fake-sms.ts';
import { createFixedClock } from '../../../testing/fixed-clock.ts';
import { CodeDeliveryError, createVerificationCodeStore } from './codes.ts';
import { createMemorySessionStore } from './memory-session-store.ts';

const PENDING_ID = 'prg_01J9Z6P2C4X8M1N7V5B3Q0R2T9';
const NUMBER = '+2348031234567';

function harness() {
  const clock = createFixedClock('2026-11-18T09:00:00Z');
  const memory = createMemorySessionStore(clock);
  const sms = createFakeSms();
  const codes = createVerificationCodeStore({
    store: memory,
    clock,
    sms,
    ttlSeconds: 10 * 60,
  });
  const issue = () =>
    codes.issue({
      targetId: PENDING_ID,
      telephoneNumber: NUMBER,
      locale: 'en-NG',
      at: clock.now().toISOString(),
    });
  return { clock, memory, sms, codes, issue };
}

/** Pull the six digits out of the message the adapter sent. */
function codeFrom(body: string): string {
  const match = /(\d{6})/.exec(body);
  if (match?.[1] === undefined) throw new Error('the message carried no code');
  return match[1];
}

describe('one-time codes', () => {
  it('stores a digest rather than the digits and matches the code it sent', async () => {
    const { memory, sms, codes, issue } = harness();

    await expect(issue()).resolves.toEqual({ status: 'sent', channel: 'sms' });

    const body = sms.sent[0]?.body ?? '';
    const code = codeFrom(body);
    expect(sms.sent[0]?.destination).toBe(NUMBER);
    expect(JSON.stringify(memory.keys())).not.toContain(NUMBER);
    for (const key of memory.keys()) {
      expect(memory.raw(key) ?? '').not.toContain(code);
    }

    await expect(codes.matches(PENDING_ID, code)).resolves.toBe('match');
    await expect(codes.matches(PENDING_ID, code === '000000' ? '111111' : '000000')).resolves.toBe(
      'mismatch',
    );
  });

  it('accepts a code once and never again', async () => {
    const { sms, codes, issue } = harness();
    await issue();
    const code = codeFrom(sms.sent[0]?.body ?? '');

    await codes.consume(PENDING_ID);

    // `C-003`: a consumed code is gone rather than wrong, so the use case answers `CODE_ALREADY_USED`
    // from the record it holds and never counts a guess against a code that no longer exists.
    await expect(codes.matches(PENDING_ID, code)).resolves.toBe('absent');
  });

  it('reports no code for a target nothing was ever sent to', async () => {
    const { codes } = harness();

    await expect(codes.matches(PENDING_ID, '418302')).resolves.toBe('absent');
  });

  it('counts wrong attempts and reports the cooldown the domain starts', async () => {
    const { clock, codes } = harness();

    await expect(codes.recordFailure(PENDING_ID, clock.now().toISOString())).resolves.toBe(1);
    await expect(codes.recordFailure(PENDING_ID, clock.now().toISOString())).resolves.toBe(2);
    await expect(codes.recordFailure(PENDING_ID, clock.now().toISOString())).resolves.toBe(3);

    const until = new Date(clock.now().getTime() + 60 * 1000).toISOString();
    await codes.startCooldown(PENDING_ID, until);
    await expect(codes.readAttempts(PENDING_ID)).resolves.toEqual({
      attempts: 3,
      cooldownUntil: until,
    });

    clock.advance(61 * 1000);
    const after = await codes.readAttempts(PENDING_ID);
    expect(after.attempts).toBe(3);
    expect(after.cooldownUntil).toBeUndefined();
  });

  it('starts the attempt count again when a new code is issued', async () => {
    const { clock, codes, issue } = harness();
    await codes.recordFailure(PENDING_ID, clock.now().toISOString());
    await codes.recordFailure(PENDING_ID, clock.now().toISOString());

    await issue();

    await expect(codes.readAttempts(PENDING_ID)).resolves.toEqual({ attempts: 0 });
  });

  it('reports a closed window as absence, never as a wrong code', async () => {
    const { clock, sms, codes, issue } = harness();
    await issue();
    const code = codeFrom(sms.sent[0]?.body ?? '');

    clock.advance(10 * 60 * 1000 + 1000);

    // `C-003`: the window closed, so there is nothing left to compare and the refusal is `CODE_EXPIRED`
    // rather than a counted wrong guess.
    await expect(codes.matches(PENDING_ID, code)).resolves.toBe('absent');
    await expect(codes.matches(PENDING_ID, '000000')).resolves.toBe('absent');
  });

  it('leaves no code behind when the gateway did not take the message', async () => {
    const { memory, sms, issue } = harness();
    sms.queue({ outcome: 'held', messageRef: null, cause: 'PROVIDER_UNAVAILABLE' });

    await expect(issue()).rejects.toBeInstanceOf(CodeDeliveryError);
    expect(memory.keys()).toHaveLength(0);
  });

  it('reports the gateway’s stable cause, never the destination', async () => {
    const { sms, issue } = harness();
    sms.queue({ outcome: 'failed', messageRef: null, cause: 'PROVIDER_REJECTED' });

    const error = await issue().catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(CodeDeliveryError);
    expect((error as CodeDeliveryError).cause).toBe('PROVIDER_REJECTED');
    expect(String(error)).not.toContain(NUMBER);
  });

  it('writes the Yoruba message for a Yoruba registration', async () => {
    const { sms, codes, clock } = harness();

    await codes.issue({
      targetId: PENDING_ID,
      telephoneNumber: NUMBER,
      locale: 'yo-NG',
      at: clock.now().toISOString(),
    });

    const body = sms.sent[0]?.body ?? '';
    expect(body).toContain('Kóòdù Oyo Digital Parliament');
    expect(body).toMatch(/\d{6}/);
  });
});

describe('rendered code bodies (C-076)', () => {
  it('mints the code it renders and matches the digits in that body', async () => {
    const { memory, codes } = harness();

    const body = await codes.renderOutstanding({ targetId: PENDING_ID, locale: 'en-NG' });
    const code = codeFrom(body);

    // The digits are the body's only copy: no key holds them, only the digest they produce.
    for (const key of memory.keys()) {
      expect(memory.raw(key) ?? '').not.toContain(code);
    }
    await expect(codes.matches(PENDING_ID, code)).resolves.toBe('match');
  });

  it('keeps one outstanding code: a fresh render starts the attempt count again', async () => {
    const { memory, codes, clock } = harness();
    await codes.renderOutstanding({ targetId: PENDING_ID, locale: 'en-NG' });
    await codes.recordFailure(PENDING_ID, clock.now().toISOString());

    const body = await codes.renderOutstanding({ targetId: PENDING_ID, locale: 'en-NG' });

    // One code key per target: the render overwrote the previous digest rather than adding a second.
    expect(memory.keys().filter((key) => key.includes('otp:code'))).toHaveLength(1);
    await expect(codes.readAttempts(PENDING_ID)).resolves.toEqual({ attempts: 0 });
    await expect(codes.matches(PENDING_ID, codeFrom(body))).resolves.toBe('match');
  });

  it('writes the rendered body in the recipient’s locale', async () => {
    const { codes } = harness();

    const body = await codes.renderOutstanding({ targetId: PENDING_ID, locale: 'yo-NG' });

    expect(body).toContain('Kóòdù Oyo Digital Parliament');
    expect(body).toMatch(/\d{6}/);
  });

  it('reports a store that refuses rather than an empty body', async () => {
    const clock = createFixedClock('2026-11-18T09:00:00Z');
    const memory = createMemorySessionStore(clock);
    const codes = createVerificationCodeStore({
      store: {
        ...memory,
        set: async () => {
          throw new Error('redis is unreachable');
        },
      },
      clock,
      sms: createFakeSms(),
      ttlSeconds: 10 * 60,
    });

    await expect(
      codes.renderOutstanding({ targetId: PENDING_ID, locale: 'en-NG' }),
    ).rejects.toThrow('redis is unreachable');
  });
});
